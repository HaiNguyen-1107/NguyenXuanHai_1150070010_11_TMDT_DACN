const express = require("express");
const router = express.Router();
const { sql, config } = require("../config/db")

router.get("/", async (req, res) => {
    if (!req.session.user) return res.redirect("/login");

    const userId = req.session.user.UserID;

    try {
        let pool = await sql.connect(config);

        const result = await pool.request()
            .input("UserID", sql.Int, userId)
            .query(`
                SELECT * FROM Orders 
                WHERE UserID = @UserID
                ORDER BY CreatedAt DESC
            `);

        const orders = result.recordset;

        res.render("orders", { orders });

    } catch (err) {
        console.error("LOAD ORDERS ERROR:", err);
        res.send("Lỗi server!");
    }
});

// API khách hàng hủy đơn hàng
router.post("/cancel/:id", async (req, res) => {
    if (!req.session.user) {
        return res.json({ success: false, message: "Bạn cần đăng nhập!" });
    }

    try {
        const orderId = req.params.id;
        const userId = req.session.user.UserID;
        let pool = await sql.connect(config);

        // Kiểm tra đơn hàng có thuộc về user này không
        const orderCheck = await pool.request()
            .input("orderId", sql.Int, orderId)
            .input("userId", sql.Int, userId)
            .query("SELECT Status FROM Orders WHERE OrderID = @orderId AND UserID = @userId");

        if (orderCheck.recordset.length === 0) {
            return res.json({ success: false, message: "Đơn hàng không tồn tại!" });
        }

        const currentStatus = orderCheck.recordset[0].Status;

        // Chỉ cho phép hủy khi đơn đang ở trạng thái Pending
        if (currentStatus !== "Pending") {
            return res.json({
                success: false,
                message: "Chỉ có thể hủy đơn hàng đang chờ xử lý!"
            });
        }

        // Lấy danh sách sản phẩm để hoàn lại stock
        const orderItems = await pool.request()
            .input("orderId", sql.Int, orderId)
            .query("SELECT VariantID, Quantity FROM OrderItems WHERE OrderID = @orderId");

        // Hoàn lại stock
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

            console.log(`♻️ [CUSTOMER CANCEL] Hoàn stock: VariantID ${item.VariantID}, Quantity: ${item.Quantity}`);
        }

        // Update status đơn hàng
        await pool.request()
            .input("orderId", sql.Int, orderId)
            .query("UPDATE Orders SET Status = 'Cancelled' WHERE OrderID = @orderId");

        res.json({ success: true, message: "Hủy đơn hàng thành công!" });

    } catch (err) {
        console.error("Cancel order error:", err);
        res.json({ success: false, message: "Lỗi server!" });
    }
});

module.exports = router;

