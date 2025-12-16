const express = require("express");
const router = express.Router();
const { sql, config } = require("../config/db");

// Lấy danh sách sản phẩm
router.get("/products", async (req, res) => {
    try {
        // Kết nối SQL
        let pool = await sql.connect(config);

        // Query lấy dữ liệu
        let result = await pool.request().query(`
            SELECT ProductID, ProductName, Price, Image, CategoryID
            FROM Products
        `);

        // Truyền dữ liệu sang view
        res.render("products", { products: result.recordset });

    } catch (err) {
        console.log("Lỗi SQL:", err);
        res.status(500).send("Lỗi server!");
    }
});

// API tìm kiếm sản phẩm
router.get("/api/products/search", async (req, res) => {
    try {
        const searchTerm = req.query.q || '';
        let pool = await sql.connect(config);

        let result = await pool.request()
            .input('searchTerm', sql.NVarChar, `%${searchTerm}%`)
            .query(`
                SELECT TOP 20 ProductID, ProductName, Price, Image, CategoryID
                FROM Products
                WHERE ProductName LIKE @searchTerm 
                   OR CAST(ProductID AS NVARCHAR) LIKE @searchTerm
                ORDER BY ProductName
            `);

        res.json({
            success: true,
            products: result.recordset
        });

    } catch (err) {
        console.log("Lỗi tìm kiếm:", err);
        res.json({ success: false, message: "Lỗi server!", products: [] });
    }
});


// Trang sản phẩm mới nhất
router.get("/products/new", async (req, res) => {
    try {
        let pool = await sql.connect(config);

        // Lấy sản phẩm mới nhất (sắp xếp theo CreatedAt giảm dần)
        let result = await pool.request().query(`
            SELECT ProductID, ProductName, Price, Image, CategoryID
            FROM Products
            ORDER BY CreatedAt DESC
        `);

        // Render view với tiêu đề "Sản phẩm mới nhất"
        res.render("products-new", {
            products: result.recordset,
            pageTitle: "Sản phẩm mới nhất"
        });

    } catch (err) {
        console.log("Lỗi SQL:", err);
        res.status(500).send("Lỗi server!");
    }
});

// Trang sản phẩm bán chạy
router.get("/products/bestseller", async (req, res) => {
    try {
        let pool = await sql.connect(config);

        // Lấy sản phẩm bán chạy (random vì chưa có cột IsFeatured hoặc SoldCount)
        let result = await pool.request().query(`
            SELECT ProductID, ProductName, Price, Image, CategoryID
            FROM Products
            ORDER BY NEWID()
        `);

        // Render view với tiêu đề "Sản phẩm bán chạy"
        res.render("products-bestseller", {
            products: result.recordset,
            pageTitle: "Sản phẩm bán chạy"
        });

    } catch (err) {
        console.log("Lỗi SQL:", err);
        res.status(500).send("Lỗi server!");
    }
});

//Áo nam

router.get("/menshirt", async (req, res) => {

    try {

        let pool = await sql.connect(config);
        let result = await pool.request().query(
            `select * from Products WHERE CategoryID = 1`
        );
        res.render("menshirt", { menshirt: result.recordset });

    } catch (err) {
        console.log("Lỗi SQL:", err);
        res.status(500).send("Lỗi server!");
    }
});

//Quần nam
router.get("/menpants", async (req, res) => {

    try {
        let pool = await sql.connect(config)
        let result = await pool.request().query(
            `select * from Products where CategoryID = 2`
        );
        res.render("menpants", { menpants: result.recordset });

    } catch (err) {
        console.log("Lỗi SQL:", err);
        res.status(500).send("Lỗi server!");
    }

});

//Phụ kiện nam
router.get("/menaccessories", async (req, res) => {

    try {

        let pool = await sql.connect(config)
        let result = await pool.request().query(
            `select * from Products where CategoryID = 3`
        );
        res.render("menaccessories", { menaccessories: result.recordset });



    } catch (err) {
        console.log("Lỗi SQL:", err);
        res.status(500).send("Lỗi server!");
    }
});

//Áo mữ

router.get("/womenshirt", async (req, res) => {
    try {
        let pool = await sql.connect(config)
        let result = await pool.request().query(
            `select * from Products where CategoryID = 4`
        )
        res.render("womenshirt", { womenshirt: result.recordset });


    } catch (err) {
        console.log("Lỗi SQL:", err);
        res.status(500).send("Lỗi server!");


    }
});

//Quần nữ
router.get("/womenpants", async (req, res) => {
    try {
        let pool = await sql.connect(config)
        let result = await pool.request().query(
            `select * from Products where CategoryID = 5`
        )
        res.render("womenpants", { womenpants: result.recordset });


    } catch (err) {
        console.log("Lỗi SQL:", err);
        res.status(500).send("Lỗi server!");


    }
});

//Phụ kiện nữ
router.get("/womenaccessories", async (req, res) => {
    try {
        let pool = await sql.connect(config)
        let result = await pool.request().query(
            `select * from Products where CategoryID = 6`
        )
        res.render("womenaccessories", { womenaccessories: result.recordset });


    } catch (err) {
        console.log("Lỗi SQL:", err);
        res.status(500).send("Lỗi server!");


    }
});


router.get("/product/:id", async (req, res) => {
    try {
        let id = req.params.id;
        let pool = await sql.connect(config);

        // Lấy thông tin sản phẩm
        let product = await pool.request()
            .input("id", sql.Int, id)
            .query(`
                SELECT ProductID, ProductName, Price, Image
                FROM Products
                WHERE ProductID = @id
            `);

        if (product.recordset.length === 0) {
            return res.send("Sản phẩm không tồn tại!");
        }

        // Lấy variant - BỔ SUNG VariantID
        let variants = await pool.request()
            .input("id", sql.Int, id)
            .query(`
                SELECT VariantID, Color, Size, Stock
                FROM ProductVariants
                WHERE ProductID = @id
            `);

        // Lấy mô tả sản phẩm
        let info = await pool.request()
            .input("id", sql.Int, id)
            .query(`
                SELECT Description
                FROM InfoProducts
                WHERE ProductID = @id
            `);

        let description = info.recordset.length > 0 ? info.recordset[0].Description : "Chưa có mô tả cho sản phẩm này.";

        let images = await pool.request()
            .input("id", sql.Int, id)
            .query(`
                SELECT ImageURL
                FROM ProductImages
                WHERE ProductID = @id
            `);

        // Fallback: Nếu không có ảnh trong ProductImages, dùng ảnh chính từ Products
        let productImages = images.recordset;
        if (productImages.length === 0) {
            productImages = [{ ImageURL: product.recordset[0].Image }];
        }

        res.render("productdetail", {
            product: product.recordset[0],
            variants: variants.recordset,
            description: description,
            productImages: productImages
        });

    } catch (err) {
        console.log("Lỗi:", err);
        res.status(500).send("Lỗi server");
    }
});

// Thêm route checkout vào cuối file products.js
router.get("/checkout", (req, res) => {
    res.render("checkout", {
        title: "Thanh toán - Fashion Shop",
        user: req.session.user
    });
});

// API lấy variant mặc định cho sản phẩm
router.get("/api/product/:id/default-variant", async (req, res) => {
    try {
        const productId = req.params.id;
        let pool = await sql.connect(config);

        // Lấy variant mặc định: ưu tiên màu Đen -> màu đầu tiên, size S -> size nhỏ nhất
        const result = await pool.request()
            .input("productId", sql.Int, productId)
            .query(`
                SELECT TOP 1 VariantID, Color, Size, Stock 
                FROM ProductVariants 
                WHERE ProductID = @productId 
                ORDER BY 
                    CASE 
                        WHEN Color = 'Den' THEN 1
                        WHEN Color = 'Đen' THEN 1
                        ELSE 2 
                    END,
                    CASE 
                        WHEN Size = 'S' THEN 1 
                        WHEN Size = 'M' THEN 2
                        WHEN Size = 'L' THEN 3
                        WHEN Size = 'XL' THEN 4
                        ELSE 5 
                    END,
                    VariantID
            `);

        if (result.recordset.length > 0) {
            const variant = result.recordset[0];
            res.json({
                variantId: variant.VariantID,
                color: variant.Color,
                size: variant.Size,
                stock: variant.Stock
            });
        } else {
            res.json({ variantId: null, color: 'Đen', size: 'S', stock: 0 });
        }

    } catch (err) {
        console.error("Get default variant error:", err);
        res.json({ variantId: null, color: 'Đen', size: 'S', stock: 0 });
    }
});
module.exports = router;
