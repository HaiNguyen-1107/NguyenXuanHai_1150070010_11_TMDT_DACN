const express = require("express");
const router = express.Router();
const { sql, config } = require("../config/db");

const QRCode = require("qrcode");



function getClientIp(req) {

    return "1.55.21.3";
}

// Trang checkout
router.get("/", (req, res) => {
    if (!req.session.user) return res.redirect("/login");

    res.render("checkout", {
        title: "Thanh toán",
        user: req.session.user
    });
});

// API tạo đơn hàng
router.post("/create-order", async (req, res) => {
    if (!req.session.user) {
        return res.json({ success: false, message: "Bạn cần đăng nhập!" });
    }

    const userId = req.session.user.UserID;

    // HỖ TRỢ CẢ BuyNow (items) VÀ Cart (cartItems)
    const items = req.body.items || req.body.cartItems;
    const paymentMethod = req.body.paymentMethod;

    if (!items || items.length === 0) {
        return res.json({ success: false, message: "Giỏ hàng rỗng!" });
    }

    try {
        let pool = await sql.connect(config);

        //  KIỂM TRA STOCK TRƯỚC KHI TẠO ĐƠN
        for (let item of items) {
            const stockCheck = await pool.request()
                .input("variantId", sql.Int, item.variantId)
                .query("SELECT Stock FROM ProductVariants WHERE VariantID = @variantId");

            if (stockCheck.recordset.length === 0) {
                return res.json({
                    success: false,
                    message: `Sản phẩm không tồn tại!`
                });
            }

            const currentStock = stockCheck.recordset[0].Stock;

            if (currentStock < item.quantity) {
                return res.json({
                    success: false,
                    message: `Sản phẩm "${item.name}" (${item.color} - ${item.size}) chỉ còn ${currentStock} sản phẩm trong kho!`
                });
            }
        }

        // Tính tổng tiền
        let subtotal = 0;
        items.forEach(item => {
            subtotal += item.price * item.quantity;
        });

        const shippingFee = 30000;
        const totalAmount = subtotal + shippingFee;

        //  KIỂM TRA VIETQR TRƯỚC - KHÔNG TẠO ĐƠN NGAY
        if (paymentMethod === "vietqr") {
            //  VIETQR: LƯU VÀO SESSION, CHƯA TẠO ĐƠN
            // Đơn hàng chỉ được tạo khi khách nhấn "Tôi đã thanh toán"

            // Lưu thông tin đơn hàng vào session
            req.session.pendingVietQROrder = {
                userId: userId,
                items: items,
                subtotal: subtotal,
                shippingFee: shippingFee,
                totalAmount: totalAmount,
                paymentMethod: paymentMethod,
                customerInfo: {
                    email: req.body.email || req.session.user.Email,
                    phone: req.body.phone || req.session.user.Phone,
                    address: req.body.address || req.session.user.Address
                }
            };

            console.log("⏳ VietQR: Lưu thông tin vào session (chưa tạo đơn)");
            console.log("🔗 Redirecting to VietQR page...");

            return res.json({
                success: true,
                paymentMethod: "vietqr",
                redirectUrl: `/checkout/vietqr-payment`
            });
        }

        //  CÁC PHƯƠNG THỨC KHÁC: TẠO ĐƠN HÀNG NGAY
        // COD: Tạo đơn và trừ stock ngay

        const orderStatus = paymentMethod === "vnpay" ? "Pending Payment" : "Pending";

        // Tạo ORDER
        const orderResult = await pool.request()
            .input("UserID", sql.Int, userId)
            .input("TotalAmount", sql.Money, totalAmount)
            .input("ShippingFee", sql.Money, shippingFee)
            .input("PaymentMethod", sql.NVarChar, paymentMethod)
            .input("Status", sql.NVarChar, orderStatus)
            .query(`
                INSERT INTO Orders (UserID, TotalAmount, ShippingFee, PaymentMethod, Status, CreatedAt)
                OUTPUT INSERTED.OrderID
                VALUES (@UserID, @TotalAmount, @ShippingFee, @PaymentMethod, @Status, GETDATE())
            `);

        const orderId = orderResult.recordset[0].OrderID;

        // INSERT OrderItems
        for (let item of items) {
            await pool.request()
                .input("OrderID", sql.Int, orderId)
                .input("ProductID", sql.Int, item.id)
                .input("VariantID", sql.Int, item.variantId)
                .input("Quantity", sql.Int, item.quantity)
                .input("Price", sql.Money, item.price)
                .input("Subtotal", sql.Money, item.price * item.quantity)
                .input("Color", sql.NVarChar, item.color)
                .input("Size", sql.NVarChar, item.size)
                .query(`
                    INSERT INTO OrderItems (OrderID, ProductID, VariantID, Quantity, Price, Subtotal, Color, Size)
                    VALUES (@OrderID, @ProductID, @VariantID, @Quantity, @Price, @Subtotal, @Color, @Size)
                `);

            //  CHỈ TRỪ STOCK NẾU LÀ COD (thanh toán khi nhận hàng)

            if (paymentMethod === "cod") {
                await pool.request()
                    .input("variantId", sql.Int, item.variantId)
                    .input("quantity", sql.Int, item.quantity)
                    .query(`
                        UPDATE ProductVariants 
                        SET Stock = Stock - @quantity,
                            Sold = Sold + @quantity
                        WHERE VariantID = @variantId
                    `);

                console.log(` [COD] Trừ stock ngay: VariantID ${item.variantId}, Quantity: ${item.quantity}`);
            } else {
                console.log(` [VNPay] Chưa trừ stock: VariantID ${item.variantId}, Quantity: ${item.quantity} (chờ thanh toán)`);
            }
        }

        // Tạo PAYMENT
        const paymentStatus = paymentMethod === "vnpay" ? "Pending" : "Pending";
        await pool.request()
            .input("OrderID", sql.Int, orderId)
            .input("Amount", sql.Money, totalAmount)
            .input("Method", sql.NVarChar, paymentMethod)
            .input("Status", sql.NVarChar, paymentStatus)
            .query(`
                INSERT INTO Payments (OrderID, Amount, Method, Status, CreatedAt)
                VALUES (@OrderID, @Amount, @Method, @Status, GETDATE())
            `);


        if (paymentMethod === "vnpay") {
            // VNPAY ĐÃ BỊ XÓA CODE XỬ LÝ - CHUYỂN VỀ TRẠNG THÁI PENDING PAYMENT NHƯ BÌNH THƯỜNG
            // Trả về thành công để redirect về trang đơn hàng
            return res.json({
                success: true,
                paymentMethod: "vnpay",
                redirectUrl: `/profile?tab=orders`
            });
        } else {
            // COD - Chuyển về trang orders
            console.log(" COD order created:", orderId);
            return res.json({
                success: true,
                paymentMethod: "cod",
                redirectUrl: `/profile?tab=orders`
            });
        }

    } catch (err) {
        console.error("CREATE ORDER ERROR:", err);
        return res.json({ success: false, message: "Lỗi server khi tạo đơn hàng!" });
    }
});



// Route hiển thị trang thanh toán VietQR
router.get("/vietqr-payment", async (req, res) => {
    try {
        // Kiểm tra session có thông tin đơn hàng pending không
        if (!req.session.pendingVietQROrder) {
            return res.redirect("/checkout");
        }

        const orderData = req.session.pendingVietQROrder;

        // ⚠️ CẤU HÌNH VIETQR - THÔNG TIN TÀI KHOẢN NHẬN TIỀN
        const BANK_ID = "970418";  // BIDV
        const ACCOUNT_NO = "6711414827";  // Số tài khoản BIDV
        const ACCOUNT_NAME = "NGUYEN XUAN HAI";  // Tên chủ tài khoản
        const TEMPLATE = "compact";  // hoặc "print", "qr_only"

        // Tạo mã đơn hàng tạm thời có ý nghĩa
        // Format: DH + UserID + 6 chữ số cuối của timestamp
        const tempOrderCode = `DH${orderData.userId}${Date.now().toString().slice(-6)}`;

        // Nội dung chuyển khoản ngắn gọn, dễ nhớ
        const transferContent = tempOrderCode;

        // Tạo URL VietQR
        const amount = Math.round(orderData.totalAmount);
        const qrImageUrl = `https://img.vietqr.io/image/${BANK_ID}-${ACCOUNT_NO}-${TEMPLATE}.jpg?amount=${amount}&addInfo=${encodeURIComponent(transferContent)}&accountName=${encodeURIComponent(ACCOUNT_NAME)}`;

        console.log(" VietQR generated from session");
        console.log(" Amount:", amount);
        console.log(" Mã đơn tạm:", tempOrderCode);
        console.log(" Content:", transferContent);
        console.log(" QR URL:", qrImageUrl);

        // Render trang VietQR
        res.render("vietqr-payment", {
            user: req.session.user,
            orderId: tempOrderCode, // Mã đơn tạm thời
            amount: orderData.totalAmount,
            qrImageUrl: qrImageUrl,
            bankName: "BIDV (Ngân hàng Đầu tư và Phát triển Việt Nam)",
            accountNo: ACCOUNT_NO,
            accountName: ACCOUNT_NAME,
            transferContent: transferContent
        });

    } catch (err) {
        console.error("VietQR Error:", err);
        res.render("order-failed", {
            user: req.session.user,
            message: "Lỗi khi tạo mã QR thanh toán"
        });
    }
});


// API check payment status (được gọi từ trang QR)
router.get("/check-payment-status/:orderId", async (req, res) => {
    try {
        // Parse orderId thành số nguyên
        const orderId = parseInt(req.params.orderId);
        let pool = await sql.connect(config);

        const orderResult = await pool.request()
            .input("orderId", sql.Int, orderId)
            .query(`
                SELECT Status 
                FROM Orders 
                WHERE OrderID = @orderId
            `);

        if (orderResult.recordset.length === 0) {
            return res.json({ status: "NotFound" });
        }

        const status = orderResult.recordset[0].Status;
        return res.json({ status: status });

    } catch (err) {
        console.error("Check payment status error:", err);
        return res.json({ status: "Error" });
    }
});

//  Route xác nhận đã thanh toán VietQR và tạo đơn hàng
router.post("/vietqr-confirm", async (req, res) => {
    try {
        // Kiểm tra session
        if (!req.session.pendingVietQROrder) {
            return res.json({
                success: false,
                message: "Không tìm thấy thông tin đơn hàng!"
            });
        }

        const orderData = req.session.pendingVietQROrder;
        let pool = await sql.connect(config);

        //  KIỂM TRA STOCK TRƯỚC KHI TẠO ĐƠN
        for (let item of orderData.items) {
            const stockCheck = await pool.request()
                .input("variantId", sql.Int, item.variantId)
                .query("SELECT Stock FROM ProductVariants WHERE VariantID = @variantId");

            if (stockCheck.recordset.length === 0) {
                return res.json({
                    success: false,
                    message: `Sản phẩm không tồn tại!`
                });
            }

            const currentStock = stockCheck.recordset[0].Stock;

            if (currentStock < item.quantity) {
                return res.json({
                    success: false,
                    message: `Sản phẩm "${item.name}" (${item.color} - ${item.size}) chỉ còn ${currentStock} sản phẩm trong kho!`
                });
            }
        }

        //  TẠO ĐƠN HÀNG với trạng thái "Pending" (Đang chờ xử lý)
        const orderResult = await pool.request()
            .input("UserID", sql.Int, orderData.userId)
            .input("TotalAmount", sql.Money, orderData.totalAmount)
            .input("ShippingFee", sql.Money, orderData.shippingFee)
            .input("PaymentMethod", sql.NVarChar, "vietqr")
            .input("Status", sql.NVarChar, "Pending") // Đang chờ xử lý
            .query(`
                INSERT INTO Orders (UserID, TotalAmount, ShippingFee, PaymentMethod, Status, CreatedAt)
                OUTPUT INSERTED.OrderID
                VALUES (@UserID, @TotalAmount, @ShippingFee, @PaymentMethod, @Status, GETDATE())
            `);

        const orderId = orderResult.recordset[0].OrderID;

        // INSERT OrderItems và TRỪ STOCK (giống COD)
        for (let item of orderData.items) {
            await pool.request()
                .input("OrderID", sql.Int, orderId)
                .input("ProductID", sql.Int, item.id)
                .input("VariantID", sql.Int, item.variantId)
                .input("Quantity", sql.Int, item.quantity)
                .input("Price", sql.Money, item.price)
                .input("Subtotal", sql.Money, item.price * item.quantity)
                .input("Color", sql.NVarChar, item.color)
                .input("Size", sql.NVarChar, item.size)
                .query(`
                    INSERT INTO OrderItems (OrderID, ProductID, VariantID, Quantity, Price, Subtotal, Color, Size)
                    VALUES (@OrderID, @ProductID, @VariantID, @Quantity, @Price, @Subtotal, @Color, @Size)
                `);

            //  TRỪ STOCK NGAY (giống COD)
            // Nếu khách gian lận, Admin có thể Hủy đơn để hoàn lại stock
            await pool.request()
                .input("variantId", sql.Int, item.variantId)
                .input("quantity", sql.Int, item.quantity)
                .query(`
                    UPDATE ProductVariants 
                    SET Stock = Stock - @quantity,
                        Sold = Sold + @quantity
                    WHERE VariantID = @variantId
                `);

            console.log(` [VietQR] Trừ stock ngay: VariantID ${item.variantId}, Quantity: ${item.quantity}`);
        }

        // Tạo PAYMENT với status "Pending"
        await pool.request()
            .input("OrderID", sql.Int, orderId)
            .input("Amount", sql.Money, orderData.totalAmount)
            .input("Method", sql.NVarChar, "vietqr")
            .input("Status", sql.NVarChar, "Pending")
            .query(`
                INSERT INTO Payments (OrderID, Amount, Method, Status, CreatedAt)
                VALUES (@OrderID, @Amount, @Method, @Status, GETDATE())
            `);

        //  XÓA SESSION SAU KHI TẠO ĐƠN THÀNH CÔNG
        delete req.session.pendingVietQROrder;

        console.log(` [VietQR] Đơn hàng #${orderId} đã được tạo với trạng thái "Pending"`);

        return res.json({
            success: true,
            orderId: orderId,
            message: "Đơn hàng đã được tạo thành công!"
        });

    } catch (err) {
        console.error("VietQR Confirm Error:", err);
        return res.json({
            success: false,
            message: "Lỗi khi tạo đơn hàng!"
        });
    }
});

// Trang success sau khi thanh toán
router.get("/order-success", (req, res) => {
    const orderId = req.query.orderId;
    res.render("order-success", {
        user: req.session.user,
        orderId: orderId,
        message: "Thanh toán VNPay thành công!"
    });
});




// Trang hóa đơn
router.get("/bill/:orderId", async (req, res) => {
    try {
        if (!req.session.user) return res.redirect("/login");

        const orderId = req.params.orderId;
        let pool = await sql.connect(config);

        const orderResult = await pool.request()
            .input("orderId", sql.Int, orderId)
            .query(`
                SELECT o.*, p.Status as PaymentStatus 
                FROM Orders o 
                LEFT JOIN Payments p ON o.OrderID = p.OrderID 
                WHERE o.OrderID = @orderId
            `);

        if (orderResult.recordset.length === 0) {
            return res.render("order-failed", {
                user: req.session.user,
                message: "Đơn hàng không tồn tại"
            });
        }

        res.render("bill", {
            user: req.session.user,
            order: orderResult.recordset[0]
        });

    } catch (err) {
        console.error("Bill error:", err);
        res.render("order-failed", {
            user: req.session.user,
            message: "Lỗi hệ thống"
        });
    }
});




module.exports = router;