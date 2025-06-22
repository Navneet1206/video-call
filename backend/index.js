import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import cors from 'cors';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['*'],
    credentials: true,
  },
});

// Middleware
app.set('port', process.env.PORT || 8000);
app.use(cors());
app.use(express.json({ limit: '40kb' }));
app.use(express.urlencoded({ limit: '40kb', extended: true }));

// Nodemailer setup
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Email sending function
const sendContactEmail = async ({ name, email, message }) => {
  const mailOptions = {
    from: email,
    to: process.env.EMAIL_USER,
    subject: `New Contact Form Submission from ${name}`,
    text: `
      Name: ${name}
      Email: ${email}
      Message: ${message}
    `,
    html: `
      <h2>New Contact Form Submission</h2>
      <p><strong>Name:</strong> ${name}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Message:</strong> ${message}</p>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
  } catch (error) {
    throw new Error('Failed to send email: ' + error.message);
  }
};

// Email route
app.post('/api/send-email', async (req, res) => {
  const { name, email, message } = req.body;

  // Validate request
  if (!name || !email || !message) {
    return res.status(400).json({ message: 'All fields are required' });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: 'Invalid email address' });
  }

  try {
    await sendContactEmail({ name, email, message });
    res.status(200).json({ message: 'Email sent successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to send email' });
  }
});

// WebSocket logic
let connections = {};
let messages = {};
let timeOnline = {};

io.on('connection', (socket) => {
  console.log('SOMETHING CONNECTED');

  socket.on('join-call', (path) => {
    if (connections[path] === undefined) {
      connections[path] = [];
    }
    connections[path].push(socket.id);

    timeOnline[socket.id] = new Date();

    for (let a = 0; a < connections[path].length; a++) {
      io.to(connections[path][a]).emit('user-joined', socket.id, connections[path]);
    }

    if (messages[path] !== undefined) {
      for (let a = 0; a < messages[path].length; ++a) {
        io.to(socket.id).emit(
          'chat-message',
          messages[path][a]['data'],
          messages[path][a]['sender'],
          messages[path][a]['socket-id-sender']
        );
      }
    }
  });

  socket.on('signal', (toId, message) => {
    io.to(toId).emit('signal', socket.id, message);
  });

  socket.on('chat-message', (data, sender) => {
    const [matchingRoom, found] = Object.entries(connections).reduce(
      ([room, isFound], [roomKey, roomValue]) => {
        if (!isFound && roomValue.includes(socket.id)) {
          return [roomKey, true];
        }
        return [room, isFound];
      },
      ['', false]
    );

    if (found === true) {
      if (messages[matchingRoom] === undefined) {
        messages[matchingRoom] = [];
      }

      messages[matchingRoom].push({ sender: sender, data: data, 'socket-id-sender': socket.id });
      console.log('message', matchingRoom, ':', sender, data);

      connections[matchingRoom].forEach((elem) => {
        io.to(elem).emit('chat-message', data, sender, socket.id);
      });
    }
  });

  socket.on('disconnect', () => {
    var diffTime = Math.abs(timeOnline[socket.id] - new Date());
    var key;

    for (const [k, v] of JSON.parse(JSON.stringify(Object.entries(connections)))) {
      for (let a = 0; a < v.length; ++a) {
        if (v[a] === socket.id) {
          key = k;

          for (let a = 0; a < connections[key].length; ++a) {
            io.to(connections[key][a]).emit('user-left', socket.id);
          }

          var index = connections[key].indexOf(socket.id);
          connections[key].splice(index, 1);

          if (connections[key].length === 0) {
            delete connections[key];
          }
        }
      }
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Internal server error' });
});

// Start server
server.listen(app.get('port'), () => {
  console.log(`LISTENING ON PORT ${app.get('port')}`);
});