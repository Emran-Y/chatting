require('dotenv').config();
const express = require('express');
const AWS = require('aws-sdk');
const socketIo = require('socket.io');
const cors = require('cors');

// Initialize DynamoDB
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.REGION_NAME, // Ensure this matches the region of your DynamoDB table
});

const dynamoDb = new AWS.DynamoDB(); // Using the low-level DynamoDB client for table creation
const documentClient = new AWS.DynamoDB.DocumentClient(); // Using DocumentClient for interacting with records

const app = express();
app.use(cors());
app.use(express.json());

// Middleware for error handling
const errorHandler = (err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something went wrong!');
};

app.use(errorHandler);

app.get('/', (req, res) => {
  res.send('Hello World');
});

const server = require('http').createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// Create DynamoDB table if not exists
const createChatTable = async () => {
  const params = {
    TableName: 'homedispo_chat_messages_v2',
    KeySchema: [
      { AttributeName: 'PK', KeyType: 'HASH' }, // Partition key
      { AttributeName: 'SK', KeyType: 'RANGE' }, // Sort key
    ],
    AttributeDefinitions: [
      { AttributeName: 'PK', AttributeType: 'S' }, // String for sender and recipient
      { AttributeName: 'SK', AttributeType: 'S' }, // String for message_id
    ],
    ProvisionedThroughput: {
      ReadCapacityUnits: 5,
      WriteCapacityUnits: 5,
    },
  };

  try {
    const data = await dynamoDb.createTable(params).promise();
    console.log('Table created successfully:', data);
  } catch (err) {
    if (err.code === 'ResourceInUseException') {
      console.log('Table already exists');
    } else {
      console.error('Error creating table:', err);
    }
  }
};

// Helper function to add message to DynamoDB
const addMessageToDynamoDb = async (sender, recipient, message, timestamp, messageId) => {
  const params = {
    TableName: 'homedispo_chat_messages_v2',
    Item: {
      PK: `${sender}#${recipient}`,
      SK: messageId,
      sender,
      recipient,
      message,
      timestamp,
      messageId,
    },
  };

  try {
    await documentClient.put(params).promise();
    console.log('Message added successfully');
  } catch (err) {
    console.error('Error adding message to DynamoDB:', err);
    throw new Error('Failed to add message to DynamoDB');
  }
};

const getMessagesFromDynamoDb = async (sender, recipient) => {
  const params1 = {
    TableName: 'homedispo_chat_messages_v2',
    KeyConditionExpression: 'PK = :pk',
    ExpressionAttributeValues: {
      ':pk': `${sender}#${recipient}`,
    },
  };

  const params2 = {
    TableName: 'homedispo_chat_messages_v2',
    KeyConditionExpression: 'PK = :pk',
    ExpressionAttributeValues: {
      ':pk': `${recipient}#${sender}`,
    },
  };

  try {
    // Query the first set of messages (sender -> recipient)
    const result1 = await documentClient.query(params1).promise();
    // Query the second set of messages (recipient -> sender)
    const result2 = await documentClient.query(params2).promise();

    // Combine the results from both queries
    const allMessages = [...(result1.Items || []), ...(result2.Items || [])];

    return allMessages;
  } catch (err) {
    console.error('Error getting messages from DynamoDB:', err);
    throw new Error('Failed to retrieve messages from DynamoDB');
  }
};

// Fetch list of users with whom a user has had a chat before
const getChatPartners = async (user) => {
  const params = {
    TableName: 'homedispo_chat_messages_v2',
    FilterExpression: 'sender = :user OR recipient = :user',
    ExpressionAttributeValues: {
      ':user': user,
    },
  };

  try {
    // Scan the table for chat messages where the user is either sender or recipient
    const result = await documentClient.scan(params).promise();

    const users = new Set();

    // Extract chat partners from sender and recipient columns
    (result.Items || []).forEach((item) => {
      if (item.sender !== user) users.add(item.sender);
      if (item.recipient !== user) users.add(item.recipient);
    });

    return [...users];
  } catch (err) {
    console.error('Error fetching chat partners:', err);
    throw new Error('Failed to fetch chat partners');
  }
};



// Get messages route
app.get('/chat/:sender/:recipient', async (req, res) => {
  try {
    const { sender, recipient } = req.params;
    const messages = await getMessagesFromDynamoDb(sender, recipient);
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get list of chat partners for a specific user
app.get('/chat-partners/:user', async (req, res) => {
  try {
    const { user } = req.params;
    const partners = await getChatPartners(user);
    res.json(partners);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Send message route
app.post('/chat', async (req, res) => {
  try {
    const { sender, recipient, message } = req.body;
    const timestamp = Date.now();
    const messageId = generateUuid(); // Generate a UUID for the message

    await addMessageToDynamoDb(sender, recipient, message, timestamp, messageId);
    console.log(`Message sent from ${sender} to ${recipient}: ${message}`);
    io.emit('chat message', { sender, recipient, message, timestamp });

    res.status(201).json({ message: 'Message sent' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Real-time chat with Socket.IO
let activeUsers = {};

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Store active users
  socket.on('join', (username) => {
    activeUsers[username] = socket.id;
    console.log(`${username} joined with socket ID: ${socket.id}`);
  });

  // Handle incoming messages
  socket.on('chat message', async ({ sender, recipient, message }) => {
    const timestamp = Date.now();
    const messageId = generateUuid();

    // Save to DynamoDB
    try {
      await addMessageToDynamoDb(sender, recipient, message, timestamp, messageId);
      console.log(`Message from ${sender} to ${recipient}: ${message}`);

      // Emit message to recipient if they are online
      const recipientSocketId = activeUsers[recipient];
      if (recipientSocketId) {
        io.to(recipientSocketId).emit('chat message', { sender, recipient, message, timestamp });
      }
    } catch (err) {
      console.error('Error handling chat message:', err);
    }
  });

  // Handle user disconnection
  socket.on('disconnect', () => {
    for (const username in activeUsers) {
      if (activeUsers[username] === socket.id) {
        delete activeUsers[username];
        console.log(`${username} disconnected.`);
        break;
      }
    }
  });
});

// Helper function to generate UUID (for message IDs)
const generateUuid = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, async () => {
  await createChatTable(); // Ensure the DynamoDB table is created before the app starts
  console.log(`Server running on port ${PORT}`);
});
