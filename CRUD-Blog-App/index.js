//Server Side Code

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const favicon = require('serve-favicon');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');
const mongoose = require('mongoose');
const validator = require('validator');
const fs = require('fs');

const jwtSecret = process.env.JWT_SECRET;
const app = express();
const PORT = process.env.PORT || 5500;

// Favicon
app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));

// Connect to MongoDB
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
  } catch (error) {}
};

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Listening on port ${PORT}`);
  });
});

// MongoDB Models
const Post = mongoose.model(
  'Post',
  new mongoose.Schema({
    title: String,
    content: String,
    imageUrl: String,
    author: String,
    timestamp: String,
  })
);

const User = mongoose.model(
  'User',
  new mongoose.Schema({
    username: String,
    password: String,
    role: String,
  })
);

// Middleware

app.use(cors({ origin: '*' }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// JWT Authentication Middleware
const authenticateJWT = (req, res, next) => {
  const token = req.headers.authorization.split(' ')[1];

  if (token) {
    jwt.verify(token, jwtSecret, (err, user) => {
      if (err) {
        console.error('JWT Verification Error', err.message);
        return res.sendStatus(403);
      }
      req.user = user;
      next();
    });
  } else {
    console.error('Token is missing');
    res.sendStatus(401);
  }
};

// User registration
app.post('/register', async (req, res) => {
  const { username, password, role } = req.body;

  // Sanitze and validate user input
  const sanitizedUsername = validator.escape(username);
  const sanitizedPassword = validator.escape(password);

  // Ensure valid input data
  if (!sanitizedUsername || !sanitizedPassword) {
    return res.status(400).send({ error: 'Invalid input data' });
  }

  const hashedPassword = await bcrypt.hash(sanitizedPassword, 10);

  const newUser = new User({
    username: sanitizedUsername,
    password: hashedPassword,
    role,
  });   /*Somthing */

  await newUser.save();
  res.status(201).send({ success: true });
});

// User login
app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  // Sanitze and validate user input
  const sanitizedUsername = validator.escape(username);
  const sanitizedPassword = validator.escape(password);

  // Ensure valid input data
  if (!sanitizedUsername || !sanitizedPassword) {
    return res.status(400).send({ error: 'Invalid input data' });
  }

  const user = await User.findOne({ username: sanitizedUsername });

  if (user) {
    if (bcrypt.compare(password, user.password)) {
      const accessToken = jwt.sign(
        { username: user.username, role: user.role },
        process.env.JWT_SECRET,
        {
          expiresIn: '24h',
        }
      );
      res
        .status(200)
        .send({ success: true, token: accessToken, role: user.role });
    } else {
      res.status(401).send({ success: false });
    }
  } else {
    res.status(401).send({ success: false });
  }
});

// Read all posts
app.get('/posts', async (req, res) => {
  const posts = await Post.find();
  res.status(200).send(posts);
});

app.post('/posts', authenticateJWT, async (req, res) => {
  if (req.user.role === 'admin') {
    const { title, content, imageUrl, author, timestamp } = req.body;

    const newPost = new Post({
      title,
      content,
      imageUrl,
      author,
      timestamp,
    });

    newPost
      .save()
      .then((savedPost) => {
        res.status(201).send(savedPost);
      })
      .catch((error) => {
        res.status(500).send({ error: 'Internal Server Error' });
      });
  } else {
    res.sendStatus(403);
  }
});

app.get('/post/:id', async (req, res) => {
  const postId = req.params.id;
  const post = await Post.findById(postId);
  if (!post) {
    return res.status(404).send('Post not found');
  }

  // Read the HTML template from the file
  fs.readFile(path.join(__dirname, 'post-detail.html'), 'utf8', (err, data) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Internal Server Error');
    }

    // Replace placeholders in th HTML with actual post data
    const postDetailHtml = data
      .replace(/\${post.imageUrl}/g, post.imageUrl)
      .replace(/\${post.title}/g, post.title)
      .replace(/\${post.timestamp}/g, post.timestamp)
      .replace(/\${post.author}/g, post.author)
      .replace(/\${post.content}/g, post.content);

    res.status(200).send(postDetailHtml);
  });
});

// Delete post
app.delete('/posts/:id', authenticateJWT, async (req, res) => {
  if (req.user.role == 'admin') {
    try {
      await Post.findByIdAndDelete(req.params.id);
      res.status(200).send({ message: 'Post deleted' });
    } catch (error) {
      res.status(500).send({ error: 'Internal Server Error' });
    }
  } else {
    res.status(403).send({ error: 'Forbidden' });
  }
});

// Update Post
app.put('/posts/:id', authenticateJWT, async (req, res) => {
  const { title, content } = req.body;
  const postId = req.params.id;

  try {
    const post = await Post.findById(postId);

    if (!post) {
      return res.status(404).send({ error: 'Post not found' });
    }

    if (req.user.role === 'admin') {
      post.title = title;
      post.content = content;
      await post.save();
      res.status(200).send(post);
    } else {
      res.status(403).send({ error: 'Forbidden' });
    }
  } catch (error) {
    res.status(500).send({ error: 'Internal Server Error' });
  }
});