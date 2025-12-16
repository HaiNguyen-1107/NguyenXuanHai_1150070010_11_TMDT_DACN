const express = require('express');
const path = require('path');
const app = express();
const session = require("express-session");

app.use(session({
  secret: "my-secret-key-123",
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

//  Cấu hình view engine là EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Bypass ngrok warning page
app.use((req, res, next) => {
  res.setHeader('ngrok-skip-browser-warning', 'true');
  next();
});

app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

app.use(express.urlencoded({ extended: false }));

const homerouter = require('./routes/home')
app.use('/', homerouter);

app.use(express.json());

const authRoutes = require('./routes/auth');
app.use('/', authRoutes);

const productrouter = require('./routes/products')
app.use('/', productrouter);

const cartRoutes = require("./routes/cart");
app.use("/", cartRoutes);

const checkoutRoutes = require("./routes/checkout");
app.use("/checkout", checkoutRoutes);

const orderRoutes = require("./routes/orders");
app.use("/orders", orderRoutes);

const adminRoutes = require("./routes/admin");
app.use("/", adminRoutes);



app.use('/assets', express.static(path.join(__dirname, 'assets')));

app.use(express.static("public"));







app.listen(3000, () => console.log(' Server chạy tại http://localhost:3000'));
