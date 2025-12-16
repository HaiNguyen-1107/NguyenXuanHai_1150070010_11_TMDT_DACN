const express = require("express");
const router = express.Router();
const { sql, config } = require("../config/db");

// Route trang chủ
router.get("/", (req, res) => {
    res.redirect("/home");
});

// Route đăng ký - GET
router.get("/register", (req, res) => {
    res.render("register");
});

// Route đăng ký - POST
router.post("/register", async (req, res) => {
    const { username, fullname, email, phone, address, role, password, confirm } = req.body;

    if (password !== confirm) {
        return res.json({ success: false, message: "Mật khẩu không khớp!" });
    }

    if (password.length < 8) {
        return res.json({ success: false, message: "Mật khẩu phải trên 8 ký tự!" });
    }

    try {
        let pool = await sql.connect(config);

        // Kiểm tra username đã tồn tại
        const checkUsername = await pool.request()
            .input("Username", sql.NVarChar, username)
            .query("SELECT * FROM Users WHERE Username = @Username");

        if (checkUsername.recordset.length > 0) {
            return res.json({ success: false, message: "Tên đăng nhập đã tồn tại!" });
        }

        // Kiểm tra email đã tồn tại
        const checkEmail = await pool.request()
            .input("Email", sql.NVarChar, email)
            .query("SELECT * FROM Users WHERE Email = @Email");

        if (checkEmail.recordset.length > 0) {
            return res.json({ success: false, message: "Email đã được sử dụng!" });
        }

        await pool.request()
            .input("Username", sql.NVarChar, username)
            .input("Password", sql.NVarChar, password)
            .input("FullName", sql.NVarChar, fullname)
            .input("Email", sql.NVarChar, email)
            .input("Phone", sql.NVarChar, phone)
            .input("Address", sql.NVarChar, address)
            .input("Role", sql.NVarChar, role)
            .input("Status", sql.Int, 1)
            .query(`
                INSERT INTO Users (Username, Password, FullName, Email, Phone, Address, Role, Status, CreatedAt)
                VALUES (@Username, @Password, @FullName, @Email, @Phone, @Address, @Role, @Status, GETDATE())
            `);

        return res.json({ success: true });

    } catch (err) {
        console.error(err);
        return res.json({ success: false, message: "Lỗi server!" });
    }
});

// Route đăng nhập - POST
router.post("/login", async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.json({ success: false, message: "Vui lòng nhập đầy đủ thông tin!" });
    }

    try {
        let pool = await sql.connect(config);

        const result = await pool.request()
            .input("Email", sql.NVarChar, email)
            .query("SELECT * FROM Users WHERE Email = @Email");

        if (result.recordset.length === 0) {
            return res.json({ success: false, message: "Email hoặc mật khẩu sai!" });
        }

        const user = result.recordset[0];

        if (user.Password !== password) {
            return res.json({ success: false, message: "Email hoặc mật khẩu sai!" });
        }

        // 🔒 Kiểm tra tài khoản có bị khóa không
        if (user.Status === 0) {
            return res.json({
                success: false,
                message: "Tài khoản này đang bị khóa! Vui lòng liên hệ quản trị viên."
            });
        }

        // Lưu session
        req.session.user = user;

        // 🔥 Tạo giỏ hàng nếu chưa có
        const cartResult = await pool.request()
            .input("userId", sql.Int, user.UserID)
            .query(`SELECT CartID FROM ShoppingCart WHERE UserID = @userId`);

        if (cartResult.recordset.length === 0) {
            await pool.request()
                .input("userId", sql.Int, user.UserID)
                .query(`INSERT INTO ShoppingCart (UserID, CreatedAt) VALUES (@userId, GETDATE())`);
        }

        return res.json({ success: true });

    } catch (err) {
        console.error(err);
        return res.json({ success: false, message: "Lỗi server!" });
    }
});

// Route trang chủ
router.get("/home", (req, res) => {
    res.render("home", { user: req.session.user || null });
});

// Route profile
router.get("/profile", async (req, res) => {
    if (!req.session.user) return res.redirect("/login");

    try {
        let pool = await sql.connect(config);
        const userId = req.session.user.UserID;

        const tab = req.query.tab || "profile";

        // Lấy danh sách đơn hàng
        const ordersResult = await pool.request()
            .input("UserID", sql.Int, userId)
            .query(`
                SELECT * FROM Orders 
                WHERE UserID = @UserID
                ORDER BY CreatedAt DESC
            `);

        const orders = ordersResult.recordset;

        // Lấy chi tiết sản phẩm từng đơn
        for (let order of orders) {
            const itemsResult = await pool.request()
                .input("OrderID", sql.Int, order.OrderID)
                .query(`
        SELECT 
            oi.*, 
            p.ProductName,
            p.Image,
            pv.Color,
            pv.Size
        FROM OrderItems oi
        JOIN Products p ON oi.ProductID = p.ProductID
        LEFT JOIN ProductVariants pv ON oi.VariantID = pv.VariantID
        WHERE oi.OrderID = @OrderID
    `);

            order.Items = itemsResult.recordset;

        }

        res.render("user-profile", {
            user: req.session.user,
            orders,
            tab
        });

    } catch (err) {
        console.error("LOAD PROFILE ERROR:", err);
        res.render("user-profile", {
            user: req.session.user,
            orders: [],
            tab: "profile"
        });
    }
});

// API cập nhật thông tin user
router.post("/update-profile", async (req, res) => {
    try {
        if (!req.session.user)
            return res.json({ success: false, message: "Chưa đăng nhập" });

        const userId = req.session.user.UserID;
        const { fullName, phone, address } = req.body;

        let pool = await sql.connect(config);

        await pool.request()
            .input("userId", sql.Int, userId)
            .input("fullName", sql.NVarChar, fullName || null)
            .input("phone", sql.NVarChar, phone || null)
            .input("address", sql.NVarChar, address || null)
            .query(`
                UPDATE Users 
                SET FullName = @fullName,
                    Phone = @phone,
                    Address = @address
                WHERE UserID = @userId
            `);

        // Cập nhật session
        req.session.user.FullName = fullName;
        req.session.user.Phone = phone;
        req.session.user.Address = address;

        return res.json({ success: true, message: "Cập nhật thành công!" });

    } catch (err) {
        console.error("Update profile error:", err);
        return res.json({ success: false, message: "Lỗi server" });
    }
});

// Route đăng xuất
router.get("/logout", (req, res) => {
    req.session.destroy((err) => {
        if (err) console.log(err);
        res.clearCookie("connect.sid");
        return res.redirect("/home");
    });
});

// Route đăng nhập admin - GET
router.get("/admin/login", (req, res) => {
    res.render("admin-login");
});

// Route đăng nhập admin - POST
router.post("/admin/login", async (req, res) => {
    const { email, password } = req.body;

    try {
        let pool = await sql.connect(config);

        const result = await pool.request()
            .input("Email", sql.NVarChar, email)
            .input("Role", sql.NVarChar, "Admin")
            .query("SELECT * FROM Users WHERE Email = @Email AND Role = @Role");

        if (result.recordset.length === 0) {
            return res.json({
                success: false,
                message: "Email không tồn tại hoặc không có quyền Admin!"
            });
        }

        const admin = result.recordset[0];

        if (admin.Password !== password) {
            return res.json({
                success: false,
                message: "Mật khẩu không đúng!"
            });
        }

        // 🔒 Kiểm tra tài khoản admin có bị khóa không
        if (admin.Status === 0) {
            return res.json({
                success: false,
                message: "Tài khoản admin này đang bị khóa!"
            });
        }

        req.session.admin = admin;

        return res.json({
            success: true,
            message: "Đăng nhập thành công!"
        });

    } catch (err) {
        console.error("Admin login error:", err);
        return res.json({
            success: false,
            message: "Lỗi server!"
        });
    }
});

// Route dashboard admin
router.get("/admin/dashboard", (req, res) => {
    res.render("admin-dashboard");
});

// Route đăng xuất admin
router.get("/admin/logout", (req, res) => {
    req.session.destroy();
    res.redirect("/admin/login");
});

// Admin Routes
router.get("/admin/users", async (req, res) => {
    if (!req.session.admin) return res.redirect("/admin/login");

    try {
        let pool = await sql.connect(config);
        const result = await pool.request().query(`
            SELECT UserID, Username, FullName, Email, Phone, Address, Role, Status, CreatedAt
            FROM Users 
            ORDER BY UserID ASC
        `);

        res.render("admin-users", { users: result.recordset });
    } catch (err) {
        console.error("Admin users error:", err);
        res.status(500).send("Lỗi server");
    }
});

router.get("/admin/products", async (req, res) => {
    if (!req.session.admin) return res.redirect("/admin/login");

    try {
        let pool = await sql.connect(config);
        const result = await pool.request().query(`
            SELECT p.*, c.CategoryName
            FROM Products p
            LEFT JOIN Category c ON p.CategoryID = c.CategoryID
            ORDER BY p.CreatedAt DESC
        `);

        // Lấy thông tin variants cho mỗi sản phẩm
        const productsWithVariants = await Promise.all(
            result.recordset.map(async (product) => {
                const variantsResult = await pool.request()
                    .input("productId", sql.Int, product.ProductID)
                    .query("SELECT Stock FROM ProductVariants WHERE ProductID = @productId");

                product.variants = variantsResult.recordset;
                return product;
            })
        );

        res.render("admin-products", { products: productsWithVariants });
    } catch (err) {
        console.error("Admin products error:", err);
        res.status(500).send("Lỗi server");
    }
});

router.get("/admin/orders", async (req, res) => {
    if (!req.session.admin) return res.redirect("/admin/login");

    try {
        let pool = await sql.connect(config);
        const result = await pool.request().query(`
            SELECT o.*, u.FullName, u.Email
            FROM Orders o
            LEFT JOIN Users u ON o.UserID = u.UserID
            ORDER BY o.CreatedAt DESC
        `);

        res.render("admin-orders", { orders: result.recordset });
    } catch (err) {
        console.error("Admin orders error:", err);
        res.status(500).send("Lỗi server");
    }
});

// API lấy chi tiết đơn hàng
router.get("/admin/orders/:id/details", async (req, res) => {
    if (!req.session.admin) {
        return res.json({ success: false, message: "Unauthorized" });
    }

    try {
        const orderId = req.params.id;
        let pool = await sql.connect(config);

        // Lấy thông tin đơn hàng + thông tin khách hàng
        const orderResult = await pool.request()
            .input("orderId", sql.Int, orderId)
            .query(`
                SELECT o.*, u.FullName, u.Email, u.Phone, u.Address
                FROM Orders o
                LEFT JOIN Users u ON o.UserID = u.UserID
                WHERE o.OrderID = @orderId
            `);

        if (orderResult.recordset.length === 0) {
            return res.json({ success: false, message: "Đơn hàng không tồn tại" });
        }

        const order = orderResult.recordset[0];

        // Lấy danh sách sản phẩm trong đơn
        const itemsResult = await pool.request()
            .input("orderId", sql.Int, orderId)
            .query(`
                SELECT 
                    oi.*,
                    p.ProductName,
                    pv.Image
                FROM OrderItems oi
                LEFT JOIN Products p ON oi.ProductID = p.ProductID
                LEFT JOIN ProductVariants pv ON oi.VariantID = pv.VariantID
                WHERE oi.OrderID = @orderId
            `);

        order.Items = itemsResult.recordset;

        res.json({ success: true, order: order });

    } catch (err) {
        console.error("Get order details error:", err);
        res.json({ success: false, message: "Lỗi server" });
    }
});

// API routes for admin actions
router.post("/admin/users/toggle/:id", async (req, res) => {
    if (!req.session.admin) return res.json({ success: false, message: "Unauthorized" });

    try {
        const userId = req.params.id;
        const { status } = req.body;

        let pool = await sql.connect(config);
        await pool.request()
            .input("userId", sql.Int, userId)
            .input("status", sql.Int, status)
            .query("UPDATE Users SET Status = @status WHERE UserID = @userId");

        res.json({ success: true });
    } catch (err) {
        console.error("Toggle user error:", err);
        res.json({ success: false, message: "Lỗi server" });
    }
});

router.delete("/admin/products/delete/:id", async (req, res) => {
    if (!req.session.admin) return res.json({ success: false, message: "Unauthorized" });

    try {
        const productId = req.params.id;
        let pool = await sql.connect(config);

        // 🗑️ XÓA CÁC BẢN GHI LIÊN QUAN TRƯỚC (theo thứ tự)

        // 1. Xóa ProductReviews (nếu có)
        await pool.request()
            .input("productId", sql.Int, productId)
            .query("DELETE FROM ProductReviews WHERE ProductID = @productId");

        // 2. Xóa ShoppingCartItems (nếu có)
        await pool.request()
            .input("productId", sql.Int, productId)
            .query("DELETE FROM ShoppingCartItems WHERE ProductID = @productId");

        // 3. Xóa InfoProducts (thông tin chi tiết sản phẩm)
        await pool.request()
            .input("productId", sql.Int, productId)
            .query("DELETE FROM InfoProducts WHERE ProductID = @productId");

        // 4. Xóa ProductVariants (QUAN TRỌNG - phải xóa trước Products)
        await pool.request()
            .input("productId", sql.Int, productId)
            .query("DELETE FROM ProductVariants WHERE ProductID = @productId");

        // 5. Cuối cùng mới xóa Products
        await pool.request()
            .input("productId", sql.Int, productId)
            .query("DELETE FROM Products WHERE ProductID = @productId");

        console.log(`✅ Đã xóa sản phẩm ID: ${productId} và tất cả dữ liệu liên quan`);
        res.json({ success: true, message: "Xóa sản phẩm thành công!" });
    } catch (err) {
        console.error("Delete product error:", err);
        res.json({ success: false, message: "Lỗi khi xóa sản phẩm" });
    }
});

router.post("/admin/orders/update-status/:id", async (req, res) => {
    if (!req.session.admin) return res.json({ success: false, message: "Unauthorized" });

    try {
        const orderId = req.params.id;
        const { status } = req.body;

        let pool = await sql.connect(config);

        // 🔄 NẾU HỦY ĐƠN HÀNG → HOÀN LẠI STOCK
        if (status === "Cancelled") {
            // Lấy danh sách sản phẩm trong đơn hàng
            const orderItems = await pool.request()
                .input("orderId", sql.Int, orderId)
                .query(`
                    SELECT VariantID, Quantity 
                    FROM OrderItems 
                    WHERE OrderID = @orderId
                `);

            // Hoàn lại stock cho từng variant
            for (let item of orderItems.recordset) {
                await pool.request()
                    .input("variantId", sql.Int, item.VariantID)
                    .input("quantity", sql.Int, item.Quantity)
                    .query(`
                        UPDATE ProductVariants 
                        SET Stock = Stock + @quantity,
                            Sold = Sold - @quantity
                        WHERE VariantID = @variantId
                    `);

                console.log(`♻️ [ADMIN CANCEL] Hoàn stock: VariantID ${item.VariantID}, Quantity: ${item.Quantity}`);
            }
        }

        // Update status đơn hàng
        await pool.request()
            .input("orderId", sql.Int, orderId)
            .input("status", sql.NVarChar, status)
            .query("UPDATE Orders SET Status = @status WHERE OrderID = @orderId");

        res.json({ success: true });
    } catch (err) {
        console.error("Update order status error:", err);
        res.json({ success: false, message: "Lỗi server" });
    }
});

// API thêm người dùng mới (Admin)
router.post("/admin/users/add", async (req, res) => {
    if (!req.session.admin) return res.json({ success: false, message: "Unauthorized" });

    const { username, fullname, email, phone, password, confirm, role } = req.body;

    if (password !== confirm) {
        return res.json({ success: false, message: "Mật khẩu không khớp!" });
    }

    if (password.length < 8) {
        return res.json({ success: false, message: "Mật khẩu phải trên 8 ký tự!" });
    }

    try {
        let pool = await sql.connect(config);

        // Kiểm tra username đã tồn tại
        const checkUsername = await pool.request()
            .input("Username", sql.NVarChar, username)
            .query("SELECT * FROM Users WHERE Username = @Username");

        if (checkUsername.recordset.length > 0) {
            return res.json({ success: false, message: "Tên đăng nhập đã tồn tại!" });
        }

        // Kiểm tra email đã tồn tại
        const checkEmail = await pool.request()
            .input("Email", sql.NVarChar, email)
            .query("SELECT * FROM Users WHERE Email = @Email");

        if (checkEmail.recordset.length > 0) {
            return res.json({ success: false, message: "Email đã tồn tại!" });
        }

        // Thêm user mới
        await pool.request()
            .input("Username", sql.NVarChar, username)
            .input("Password", sql.NVarChar, password)
            .input("FullName", sql.NVarChar, fullname || null)
            .input("Email", sql.NVarChar, email)
            .input("Phone", sql.NVarChar, phone || null)
            .input("Role", sql.NVarChar, role)
            .input("Status", sql.Int, 1)
            .query(`
                INSERT INTO Users (Username, Password, FullName, Email, Phone, Role, Status, CreatedAt)
                VALUES (@Username, @Password, @FullName, @Email, @Phone, @Role, @Status, GETDATE())
            `);

        return res.json({ success: true, message: "Thêm người dùng thành công!" });

    } catch (err) {
        console.error("Add user error:", err);
        return res.json({ success: false, message: "Lỗi server!" });
    }
});

// API xóa người dùng (Admin)
router.delete("/admin/users/delete/:id", async (req, res) => {
    if (!req.session.admin) return res.json({ success: false, message: "Unauthorized" });

    try {
        const userId = req.params.id;
        let pool = await sql.connect(config);

        // Không cho phép xóa chính mình
        if (req.session.admin.UserID == userId) {
            return res.json({ success: false, message: "Không thể xóa tài khoản của chính bạn!" });
        }

        await pool.request()
            .input("userId", sql.Int, userId)
            .query("DELETE FROM Users WHERE UserID = @userId");

        res.json({ success: true, message: "Xóa người dùng thành công!" });
    } catch (err) {
        console.error("Delete user error:", err);
        res.json({ success: false, message: "Lỗi server" });
    }
});

// API lấy thông tin user theo ID (Admin)
router.get("/admin/users/get/:id", async (req, res) => {
    if (!req.session.admin) return res.json({ success: false, message: "Unauthorized" });

    try {
        const userId = req.params.id;
        let pool = await sql.connect(config);

        const result = await pool.request()
            .input("userId", sql.Int, userId)
            .query("SELECT UserID, Username, FullName, Email, Phone, Address, Role, Status FROM Users WHERE UserID = @userId");

        if (result.recordset.length === 0) {
            return res.json({ success: false, message: "Người dùng không tồn tại" });
        }

        res.json({ success: true, user: result.recordset[0] });
    } catch (err) {
        console.error("Get user error:", err);
        res.json({ success: false, message: "Lỗi server" });
    }
});

// API cập nhật thông tin user (Admin)
router.post("/admin/users/update/:id", async (req, res) => {
    if (!req.session.admin) return res.json({ success: false, message: "Unauthorized" });

    try {
        const userId = req.params.id;
        const { username, fullname, email, phone, address, role } = req.body;
        let pool = await sql.connect(config);

        // Kiểm tra username đã tồn tại (ngoại trừ user hiện tại)
        const checkUsername = await pool.request()
            .input("Username", sql.NVarChar, username)
            .input("UserId", sql.Int, userId)
            .query("SELECT * FROM Users WHERE Username = @Username AND UserID != @UserId");

        if (checkUsername.recordset.length > 0) {
            return res.json({ success: false, message: "Tên đăng nhập đã tồn tại!" });
        }

        // Kiểm tra email đã tồn tại (ngoại trừ user hiện tại)
        const checkEmail = await pool.request()
            .input("Email", sql.NVarChar, email)
            .input("UserId", sql.Int, userId)
            .query("SELECT * FROM Users WHERE Email = @Email AND UserID != @UserId");

        if (checkEmail.recordset.length > 0) {
            return res.json({ success: false, message: "Email đã tồn tại!" });
        }

        // Cập nhật thông tin user
        await pool.request()
            .input("userId", sql.Int, userId)
            .input("Username", sql.NVarChar, username)
            .input("FullName", sql.NVarChar, fullname || null)
            .input("Email", sql.NVarChar, email)
            .input("Phone", sql.NVarChar, phone || null)
            .input("Address", sql.NVarChar, address || null)
            .input("Role", sql.NVarChar, role)
            .query(`
                UPDATE Users 
                SET Username = @Username,
                    FullName = @FullName,
                    Email = @Email,
                    Phone = @Phone,
                    Address = @Address,
                    Role = @Role
                WHERE UserID = @userId
            `);

        res.json({ success: true, message: "Cập nhật người dùng thành công!" });
    } catch (err) {
        console.error("Update user error:", err);
        res.json({ success: false, message: "Lỗi server" });
    }
});

module.exports = router;