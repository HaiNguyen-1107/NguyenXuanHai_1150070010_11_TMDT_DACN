const express = require("express");
const router = express.Router();
const { sql, config } = require("../config/db")

router.get("/home", async (req, res) => {
    try {
        let pool = await sql.connect(config);

        // Lấy 6 sản phẩm mới nhất
        let newProducts = await pool.request().query(`
            SELECT TOP 6 ProductID, ProductName, Price, Image
            FROM Products
            ORDER BY CreatedAt DESC
        `);

        // Lấy 6 sản phẩm bán chạy 
        let bestSellers = await pool.request().query(`
            SELECT TOP 6 ProductID, ProductName, Price, Image
            FROM Products
            ORDER BY NEWID()
        `);

        res.render("home", {
            newProducts: newProducts.recordset,
            bestSellers: bestSellers.recordset
        });

    } catch (err) {
        console.log("Lỗi SQL:", err);
        res.render("home", {
            newProducts: [],
            bestSellers: []
        });
    }
});

// Route: Trang Giới thiệu
router.get("/about", (req, res) => {
    res.render("about");
});

// Route: Trang Liên hệ
router.get("/contact", (req, res) => {
    res.render("contact");
});

// Route: Trang Tin tức
router.get("/news", (req, res) => {
    res.render("news");
});

// Route: Chi tiết tin tức
router.get("/news/:id", (req, res) => {
    res.render("news-detail", { newsId: req.params.id });
});

module.exports = router;