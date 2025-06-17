const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const session = require('express-session');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Cấu hình MongoDB
mongoose.set('strictQuery', false);
mongoose.connect('mongodb://127.0.0.1:27017/ticket-booking', {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('MongoDB đã kết nối thành công'))
.catch((err) => {
  console.error('Lỗi kết nối MongoDB:', err);
  process.exit(1);
});

// Middleware
app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({ 
  secret: 'ticket-booking-secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }
}));
app.set('view engine', 'ejs');
app.use(express.static('public'));

// Models
const Bus = require('./models/Bus');
const Booking = require('./models/Booking');
const User = require('./models/User');

// Middleware kiểm tra đăng nhập
const requireLogin = (req, res, next) => {
  if (req.session.user) {
    next();
  } else {
    res.redirect('/login');
  }
};

// Middleware kiểm tra quyền admin
const requireAdmin = (req, res, next) => {
  if (req.session.user && req.session.user.role === 'admin') {
    next();
  } else {
    res.status(403).send('Không có quyền truy cập');
  }
};

// Home
app.get('/', async (req, res) => {
  try {
    const query = {};
    if (req.query.from) {
      query['route.from'] = new RegExp(req.query.from, 'i');
    }
    if (req.query.to) {
      query['route.to'] = new RegExp(req.query.to, 'i');
    }
    if (req.query.date) {
      const date = new Date(req.query.date);
      const nextDate = new Date(date);
      nextDate.setDate(date.getDate() + 1);
      query.departureTime = {
        $gte: date,
        $lt: nextDate
      };
    }
    
    const buses = await Bus.find(query);
    res.render('index', { buses, user: req.session.user, query: req.query });
  } catch (error) {
    console.error('Lỗi trang chủ:', error);
    res.status(500).send('Lỗi server: ' + error.message);
  }
});

// Đăng ký
app.get('/register', (req, res) => {
  res.render('register');
});

app.post('/register', async (req, res) => {
  try {
    const { username, password, fullName, email } = req.body;
    
    // Kiểm tra username đã tồn tại chưa
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.send('Tên đăng nhập đã tồn tại');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      username,
      password: hashedPassword,
      fullName,
      email,
      role: 'user'
    });

    console.log('Đăng ký thành công:', user);
    res.redirect('/login');
  } catch (error) {
    console.error('Lỗi đăng ký:', error);
    res.send('Đăng ký thất bại: ' + error.message);
  }
});

// Đăng nhập
app.get('/login', (req, res) => {
  res.render('login');
});

app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    console.log('Đang đăng nhập với:', username);

    const user = await User.findOne({ username });
    if (!user) {
      console.log('Không tìm thấy user:', username);
      return res.send('Sai thông tin đăng nhập');
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      console.log('Mật khẩu không khớp cho user:', username);
      return res.send('Sai thông tin đăng nhập');
    }

    console.log('Đăng nhập thành công:', user);
    req.session.user = user;
    res.redirect('/');
  } catch (error) {
    console.error('Lỗi đăng nhập:', error);
    res.send('Đăng nhập thất bại: ' + error.message);
  }
});

// Đăng xuất
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

// Đặt vé giao diện
app.get('/book/:busId', requireLogin, async (req, res) => {
  try {
    const bus = await Bus.findById(req.params.busId);
    if (!bus) {
      return res.status(404).send('Không tìm thấy chuyến xe');
    }
    if (bus.availableSeats < 1) {
      return res.status(400).send('Hết vé');
    }
    res.render('book', { bus });
  } catch (error) {
    console.error('Lỗi trang đặt vé:', error);
    res.status(500).send('Lỗi server: ' + error.message);
  }
});

// Đặt vé lưu DB
app.post('/book/:busId', requireLogin, async (req, res) => {
  try {
    const { phone, seatNumber } = req.body;
    const bus = await Bus.findById(req.params.busId);
    
    if (!bus) {
      return res.status(404).send('Không tìm thấy chuyến xe');
    }
    
    if (bus.availableSeats < 1) {
      return res.status(400).send('Hết vé');
    }

    const booking = await Booking.create({
      user: req.session.user._id,
      bus: req.params.busId,
      phone,
      seatNumber,
      status: 'pending'
    });

    console.log('Đặt vé thành công:', booking);

    bus.availableSeats -= 1;
    await bus.save();

    res.redirect('/my-bookings');
  } catch (error) {
    console.error('Lỗi đặt vé:', error);
    res.status(500).send('Đặt vé thất bại: ' + error.message);
  }
});

// Xem đặt vé của tôi
app.get('/my-bookings', requireLogin, async (req, res) => {
  try {
    const bookings = await Booking.find({ user: req.session.user._id })
      .populate('bus')
      .sort('-createdAt');
    res.render('my-bookings', { bookings });
  } catch (error) {
    console.error('Lỗi xem đặt vé:', error);
    res.status(500).send('Lỗi server: ' + error.message);
  }
});

// Hủy đặt vé
app.post('/my-bookings/:bookingId/cancel', requireLogin, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.bookingId);
    if (!booking || booking.user.toString() !== req.session.user._id.toString()) {
      return res.status(404).send('Không tìm thấy đặt vé');
    }

    if (booking.status !== 'pending') {
      return res.status(400).send('Không thể hủy đặt vé này');
    }

    booking.status = 'cancelled';
    await booking.save();
    console.log('Hủy vé thành công:', booking);

    const bus = await Bus.findById(booking.bus);
    bus.availableSeats += 1;
    await bus.save();

    res.redirect('/my-bookings');
  } catch (error) {
    console.error('Lỗi hủy vé:', error);
    res.status(500).send('Lỗi server: ' + error.message);
  }
});

// Admin routes
// Quản lý chuyến xe
app.get('/admin/buses', requireAdmin, async (req, res) => {
  try {
    const buses = await Bus.find().sort('-departureTime');
    res.render('admin/buses', { buses });
  } catch (error) {
    console.error('Lỗi quản lý chuyến xe:', error);
    res.status(500).send('Lỗi server: ' + error.message);
  }
});

// Thêm chuyến xe mới
app.post('/admin/buses', requireAdmin, async (req, res) => {
  try {
    const { company, route, departureTime, price, seats } = req.body;
    const bus = await Bus.create({
      company,
      route,
      departureTime,
      price,
      seats,
      availableSeats: seats
    });
    console.log('Thêm chuyến xe thành công:', bus);
    res.redirect('/admin/buses');
  } catch (error) {
    console.error('Lỗi thêm chuyến xe:', error);
    res.status(500).send('Thêm chuyến xe thất bại: ' + error.message);
  }
});

// Sửa chuyến xe
app.get('/admin/buses/:busId/edit', requireAdmin, async (req, res) => {
  try {
    const bus = await Bus.findById(req.params.busId);
    if (!bus) {
      return res.status(404).send('Không tìm thấy chuyến xe');
    }
    res.render('admin/edit-bus', { bus });
  } catch (error) {
    console.error('Lỗi sửa chuyến xe:', error);
    res.status(500).send('Lỗi server: ' + error.message);
  }
});

app.post('/admin/buses/:busId/edit', requireAdmin, async (req, res) => {
  try {
    const { company, route, departureTime, price, seats } = req.body;
    const bus = await Bus.findById(req.params.busId);
    
    if (!bus) {
      return res.status(404).send('Không tìm thấy chuyến xe');
    }

    const seatsDiff = seats - bus.seats;
    bus.company = company;
    bus.route = route;
    bus.departureTime = departureTime;
    bus.price = price;
    bus.seats = seats;
    bus.availableSeats += seatsDiff;

    await bus.save();
    console.log('Sửa chuyến xe thành công:', bus);
    res.redirect('/admin/buses');
  } catch (error) {
    console.error('Lỗi sửa chuyến xe:', error);
    res.status(500).send('Sửa chuyến xe thất bại: ' + error.message);
  }
});

// Xóa chuyến xe
app.post('/admin/buses/:busId/delete', requireAdmin, async (req, res) => {
  try {
    const bus = await Bus.findById(req.params.busId);
    if (!bus) {
      return res.status(404).send('Không tìm thấy chuyến xe');
    }

    const hasBookings = await Booking.exists({ bus: bus._id });
    if (hasBookings) {
      return res.status(400).send('Không thể xóa chuyến xe đã có đặt vé');
    }

    await bus.deleteOne();
    console.log('Xóa chuyến xe thành công:', bus._id);
    res.redirect('/admin/buses');
  } catch (error) {
    console.error('Lỗi xóa chuyến xe:', error);
    res.status(500).send('Xóa chuyến xe thất bại: ' + error.message);
  }
});

// Quản lý đặt vé
app.get('/admin/bookings', requireAdmin, async (req, res) => {
  try {
    const bookings = await Booking.find()
      .populate('user')
      .populate('bus')
      .sort('-createdAt');
    res.render('admin/bookings', { bookings });
  } catch (error) {
    console.error('Lỗi quản lý đặt vé:', error);
    res.status(500).send('Lỗi server: ' + error.message);
  }
});

// Xác nhận đặt vé
app.post('/admin/bookings/:bookingId/confirm', requireAdmin, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.bookingId);
    if (!booking) {
      return res.status(404).send('Không tìm thấy đặt vé');
    }

    booking.status = 'confirmed';
    await booking.save();
    console.log('Xác nhận đặt vé thành công:', booking);
    res.redirect('/admin/bookings');
  } catch (error) {
    console.error('Lỗi xác nhận đặt vé:', error);
    res.status(500).send('Lỗi server: ' + error.message);
  }
});

// Hủy đặt vé (admin)
app.post('/admin/bookings/:bookingId/cancel', requireAdmin, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.bookingId);
    if (!booking) {
      return res.status(404).send('Không tìm thấy đặt vé');
    }

    booking.status = 'cancelled';
    await booking.save();
    console.log('Hủy đặt vé thành công:', booking);

    const bus = await Bus.findById(booking.bus);
    bus.availableSeats += 1;
    await bus.save();

    res.redirect('/admin/bookings');
  } catch (error) {
    console.error('Lỗi hủy đặt vé:', error);
    res.status(500).send('Lỗi server: ' + error.message);
  }
});

app.listen(PORT, () => console.log(`Server đang chạy tại http://localhost:${PORT}`));
