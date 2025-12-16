const express = require("express");
const router = express.Router();
const { sql, config } = require("../config/db");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Configure multer for file upload
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, '../assets/uploads/products');
        // Create directory if it doesn't exist
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'product-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: function (req, file, cb) {
        const filetypes = /jpeg|jpg|png|gif|webp/;
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = filetypes.test(file.mimetype);

        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Chỉ chấp nhận file ảnh!'));
        }
    }
});

// Admin Dashboard
router.get("/admin/dashboard", async (req, res) => {
    try {
        let pool = await sql.connect(config);

        // Get statistics
        let stats = await pool.request().query(`
            SELECT 
                (SELECT COUNT(*) FROM Users) as totalUsers,
                (SELECT COUNT(*) FROM Products) as totalProducts,
                (SELECT COUNT(*) FROM Orders) as totalOrders,
                (SELECT ISNULL(SUM(TotalAmount), 0) FROM Orders WHERE Status = 'Completed') as totalRevenue
        `);

        res.render("admin-dashboard", {
            stats: stats.recordset[0]
        });
    } catch (err) {
        console.log("Error:", err);
        res.status(500).send("Lỗi server!");
    }
});

// Admin Products Page
router.get("/admin/products", async (req, res) => {
    try {
        let pool = await sql.connect(config);

        // Get all products with variants
        let products = await pool.request().query(`
            SELECT p.ProductID, p.ProductName, p.Price, p.Image, p.CategoryID, p.CreatedAt,
                   ISNULL(SUM(pv.Stock), 0) as Stock,
                   ISNULL(p.Sold, 0) as Sold
            FROM Products p
            LEFT JOIN ProductVariants pv ON p.ProductID = pv.ProductID
            GROUP BY p.ProductID, p.ProductName, p.Price, p.Image, p.CategoryID, p.CreatedAt, p.Sold
            ORDER BY p.CreatedAt DESC
        `);

        res.render("admin-products", {
            products: products.recordset
        });
    } catch (err) {
        console.log("Error:", err);
        res.status(500).send("Lỗi server!");
    }
});

// Add Product (POST)
router.post("/admin/products/add", upload.fields([
    { name: 'productImage', maxCount: 1 },
    { name: 'detailImages', maxCount: 5 }
]), async (req, res) => {
    try {
        console.log('=== Request Body ===');
        console.log('Full req.body:', JSON.stringify(req.body, null, 2));
        console.log('req.body keys:', Object.keys(req.body));
        console.log('Files:', req.files);

        const { productName, price, category, description } = req.body;

        // Try different ways to get array data
        const colors = req.body['color[]'] || req.body.color || [];
        const sizes = req.body['size[]'] || req.body.size || [];
        const stocks = req.body['stock[]'] || req.body.stock || [];

        console.log('Extracted:', { colors, sizes, stocks });

        // Get main image path
        const mainImage = req.files['productImage'] ? req.files['productImage'][0] : null;
        const imagePath = mainImage ? `/assets/uploads/products/${mainImage.filename}` : null;

        if (!imagePath) {
            return res.json({ success: false, message: 'Vui lòng upload ảnh sản phẩm!' });
        }

        // Get detail images
        const detailImages = req.files['detailImages'] || [];

        let pool = await sql.connect(config);

        // Insert product
        let result = await pool.request()
            .input('productName', sql.NVarChar, productName)
            .input('price', sql.Decimal(18, 2), price)
            .input('categoryID', sql.Int, category)
            .input('image', sql.NVarChar, imagePath)
            .query(`
                INSERT INTO Products (ProductName, Price, CategoryID, Image, CreatedAt)
                OUTPUT INSERTED.ProductID
                VALUES (@productName, @price, @categoryID, @image, GETDATE())
            `);

        const productID = result.recordset[0].ProductID;

        // Insert description if provided
        if (description) {
            await pool.request()
                .input('productID', sql.Int, productID)
                .input('description', sql.NVarChar, description)
                .query(`
                    INSERT INTO InfoProducts (ProductID, Description)
                    VALUES (@productID, @description)
                `);
        }

        //  Insert detail images into ProductImages table
        if (detailImages.length > 0) {
            for (let i = 0; i < detailImages.length; i++) {
                const detailImagePath = `/assets/uploads/products/${detailImages[i].filename}`;
                await pool.request()
                    .input('productID', sql.Int, productID)
                    .input('imageURL', sql.NVarChar, detailImagePath)
                    .query(`
                        INSERT INTO ProductImages (ProductID, ImageURL)
                        VALUES (@productID, @imageURL)
                    `);
                console.log(` Inserted detail image ${i + 1}: ${detailImagePath}`);
            }
        }

        // Insert variants (use the already extracted variables)
        let colorArray = colors;
        let sizeArray = sizes;
        let stockArray = stocks;

        // Ensure arrays
        if (!Array.isArray(colorArray)) colorArray = colorArray ? [colorArray] : [];
        if (!Array.isArray(sizeArray)) sizeArray = sizeArray ? [sizeArray] : [];
        if (!Array.isArray(stockArray)) stockArray = stockArray ? [stockArray] : [];

        console.log('Variants to insert:', { colorArray, sizeArray, stockArray });

        if (colorArray.length > 0 && sizeArray.length > 0 && stockArray.length > 0) {
            for (let i = 0; i < colorArray.length; i++) {
                if (colorArray[i] && sizeArray[i] && stockArray[i]) {
                    await pool.request()
                        .input('productID', sql.Int, productID)
                        .input('color', sql.NVarChar, colorArray[i])
                        .input('size', sql.NVarChar, sizeArray[i])
                        .input('stock', sql.Int, parseInt(stockArray[i]))
                        .query(`
                            INSERT INTO ProductVariants (ProductID, Color, Size, Stock)
                            VALUES (@productID, @color, @size, @stock)
                        `);
                    console.log(`Inserted variant ${i + 1}: ${colorArray[i]}, ${sizeArray[i]}, ${stockArray[i]}`);
                }
            }
        } else {
            console.log('No variants to insert');
        }

        res.json({ success: true, message: 'Thêm sản phẩm thành công!', productID: productID });

    } catch (err) {
        console.error("Error adding product:", err);
        res.json({ success: false, message: 'Lỗi khi thêm sản phẩm: ' + err.message });
    }
});

// Admin Users Page
router.get("/admin/users", async (req, res) => {
    try {
        let pool = await sql.connect(config);
        const request = pool.request();
        const searchQuery = req.query.search;
        let query = `
            SELECT UserID, Username, Email, FullName, Phone, Address, CreatedAt, Role, Status
            FROM Users
        `;

        console.log('Admin Users Search:', searchQuery);

        // Nếu có tìm kiếm
        if (searchQuery && searchQuery.trim() !== '') {
            query += `
                WHERE Username LIKE N'%' + @search + '%'
                OR Email LIKE N'%' + @search + '%'
                OR FullName LIKE N'%' + @search + '%'
            `;
            // Add parameter
            request.input('search', sql.NVarChar, searchQuery);
        }

        query += ` ORDER BY CreatedAt DESC`;

        // const request = pool.request(); // Đã khai báo ở trên? Không, ở dưới.
        // Chú ý: request phải được tạo trước khi input.

        // Sửa lại logic flow:
        /*
        Code cũ: 
        const request = pool.request();
        if (searchQuery) request.input...
        let users = await request.query(query);
        */

        // Code mới trong block replace này cần cẩn thận context.


        let users = await request.query(query);

        res.render("admin-users", {
            users: users.recordset,
            searchQuery: searchQuery
        });
    } catch (err) {
        console.log("Error:", err);
        res.status(500).send("Lỗi server!");
    }
});

// Admin Orders Page
router.get("/admin/orders", async (req, res) => {
    try {
        let pool = await sql.connect(config);
        let orders = await pool.request().query(`
            SELECT o.OrderID, o.UserID, u.Username, o.TotalAmount, o.Status, o.CreatedAt
            FROM Orders o
            LEFT JOIN Users u ON o.UserID = u.UserID
            ORDER BY o.CreatedAt DESC
        `);

        res.render("admin-orders", {
            orders: orders.recordset
        });
    } catch (err) {
        console.log("Error:", err);
        res.status(500).send("Lỗi server!");
    }
});

// Get Product Data API (for Edit Modal)
router.get("/admin/products/api/:id", async (req, res) => {
    try {
        const productID = parseInt(req.params.id);
        let pool = await sql.connect(config);

        // Get product details
        let product = await pool.request()
            .input('productID', sql.Int, productID)
            .query('SELECT * FROM Products WHERE ProductID = @productID');

        if (product.recordset.length === 0) {
            return res.json({ success: false, message: 'Sản phẩm không tồn tại!' });
        }

        // Get product variants
        let variants = await pool.request()
            .input('productID', sql.Int, productID)
            .query('SELECT * FROM ProductVariants WHERE ProductID = @productID ORDER BY VariantID');

        // Get product description
        let info = await pool.request()
            .input('productID', sql.Int, productID)
            .query('SELECT Description FROM InfoProducts WHERE ProductID = @productID');

        const description = info.recordset.length > 0 ? info.recordset[0].Description : '';

        // Get detail images
        let images = await pool.request()
            .input('productID', sql.Int, productID)
            .query('SELECT ImageID, ImageURL FROM ProductImages WHERE ProductID = @productID ORDER BY ImageID');

        res.json({
            success: true,
            product: product.recordset[0],
            variants: variants.recordset,
            description: description,
            detailImages: images.recordset
        });

    } catch (err) {
        console.error("Error loading product data:", err);
        res.json({ success: false, message: "Lỗi server: " + err.message });
    }
});


// Update Product (POST)
router.post("/admin/products/edit/:id", upload.fields([
    { name: 'productImage', maxCount: 1 },
    { name: 'newDetailImages', maxCount: 5 }
]), async (req, res) => {
    try {
        const productID = parseInt(req.params.id);
        console.log('=== Updating Product ID:', productID, '===');
        console.log('Request body:', req.body);

        const { productName, price, category, description, imagesToDelete, variantsToDelete } = req.body;

        let pool = await sql.connect(config);

        // 1. Update main product info
        let imagePath = null;
        if (req.files['productImage'] && req.files['productImage'][0]) {
            const mainImage = req.files['productImage'][0];
            imagePath = `/assets/uploads/products/${mainImage.filename}`;

            // Delete old image file (optional)
            const oldProduct = await pool.request()
                .input('productID', sql.Int, productID)
                .query('SELECT Image FROM Products WHERE ProductID = @productID');

            if (oldProduct.recordset.length > 0) {
                const oldImagePath = oldProduct.recordset[0].Image;
                if (oldImagePath && oldImagePath.startsWith('/assets/uploads/')) {
                    const fullPath = path.join(__dirname, '..', oldImagePath);
                    if (fs.existsSync(fullPath)) {
                        fs.unlinkSync(fullPath);
                    }
                }
            }
        }

        // Update product
        if (imagePath) {
            await pool.request()
                .input('productID', sql.Int, productID)
                .input('productName', sql.NVarChar, productName)
                .input('price', sql.Decimal(18, 2), price)
                .input('categoryID', sql.Int, category)
                .input('image', sql.NVarChar, imagePath)
                .query(`
                    UPDATE Products 
                    SET ProductName = @productName, 
                        Price = @price, 
                        CategoryID = @categoryID, 
                        Image = @image
                    WHERE ProductID = @productID
                `);
        } else {
            await pool.request()
                .input('productID', sql.Int, productID)
                .input('productName', sql.NVarChar, productName)
                .input('price', sql.Decimal(18, 2), price)
                .input('categoryID', sql.Int, category)
                .query(`
                    UPDATE Products 
                    SET ProductName = @productName, 
                        Price = @price, 
                        CategoryID = @categoryID
                    WHERE ProductID = @productID
                `);
        }

        console.log(' Product updated');

        // 2. Update description
        const existingDesc = await pool.request()
            .input('productID', sql.Int, productID)
            .query('SELECT * FROM InfoProducts WHERE ProductID = @productID');

        if (description) {
            if (existingDesc.recordset.length > 0) {
                await pool.request()
                    .input('productID', sql.Int, productID)
                    .input('description', sql.NVarChar, description)
                    .query('UPDATE InfoProducts SET Description = @description WHERE ProductID = @productID');
            } else {
                await pool.request()
                    .input('productID', sql.Int, productID)
                    .input('description', sql.NVarChar, description)
                    .query('INSERT INTO InfoProducts (ProductID, Description) VALUES (@productID, @description)');
            }
            console.log(' Description updated');
        }

        // 3. Delete marked images
        if (imagesToDelete) {
            const imageIds = imagesToDelete.split(',').map(id => parseInt(id)).filter(id => id > 0);
            for (let imageId of imageIds) {
                // Get image path before deleting
                const imgData = await pool.request()
                    .input('imageID', sql.Int, imageId)
                    .query('SELECT ImageURL FROM ProductImages WHERE ImageID = @imageID');

                if (imgData.recordset.length > 0) {
                    const imgPath = imgData.recordset[0].ImageURL;

                    // Delete from database
                    await pool.request()
                        .input('imageID', sql.Int, imageId)
                        .query('DELETE FROM ProductImages WHERE ImageID = @imageID');

                    // Delete file
                    if (imgPath && imgPath.startsWith('/assets/uploads/')) {
                        const fullPath = path.join(__dirname, '..', imgPath);
                        if (fs.existsSync(fullPath)) {
                            fs.unlinkSync(fullPath);
                        }
                    }
                }
            }
            console.log(' Deleted images:', imageIds);
        }

        // 4. Add new detail images
        if (req.files['newDetailImages']) {
            const newDetailImages = req.files['newDetailImages'];
            for (let img of newDetailImages) {
                const detailImagePath = `/assets/uploads/products/${img.filename}`;
                await pool.request()
                    .input('productID', sql.Int, productID)
                    .input('imageURL', sql.NVarChar, detailImagePath)
                    .query('INSERT INTO ProductImages (ProductID, ImageURL) VALUES (@productID, @imageURL)');
            }
            console.log(' Added new detail images:', newDetailImages.length);
        }

        // 5. Update variants
        const variantIDs = req.body['variantID[]'] || [];
        const colors = req.body['color[]'] || [];
        const sizes = req.body['size[]'] || [];
        const stocks = req.body['stock[]'] || [];

        // Ensure arrays
        const variantIDArray = Array.isArray(variantIDs) ? variantIDs : [variantIDs];
        const colorArray = Array.isArray(colors) ? colors : [colors];
        const sizeArray = Array.isArray(sizes) ? sizes : [sizes];
        const stockArray = Array.isArray(stocks) ? stocks : [stocks];

        console.log('Variants data:', { variantIDArray, colorArray, sizeArray, stockArray });

        // Delete marked variants
        if (variantsToDelete) {
            const variantIds = variantsToDelete.split(',').map(id => parseInt(id)).filter(id => id > 0);
            for (let variantId of variantIds) {
                await pool.request()
                    .input('variantID', sql.Int, variantId)
                    .query('DELETE FROM ProductVariants WHERE VariantID = @variantID');
            }
            console.log(' Deleted variants:', variantIds);
        }

        // Update or insert variants
        for (let i = 0; i < variantIDArray.length; i++) {
            const variantID = parseInt(variantIDArray[i]);
            const color = colorArray[i];
            const size = sizeArray[i];
            const stock = parseInt(stockArray[i]);

            if (variantID > 0) {
                // Update existing variant
                await pool.request()
                    .input('variantID', sql.Int, variantID)
                    .input('color', sql.NVarChar, color)
                    .input('size', sql.NVarChar, size)
                    .input('stock', sql.Int, stock)
                    .query(`
                        UPDATE ProductVariants 
                        SET Color = @color, Size = @size, Stock = @stock 
                        WHERE VariantID = @variantID
                    `);
                console.log(` Updated variant ${variantID}`);
            } else {
                // Insert new variant
                await pool.request()
                    .input('productID', sql.Int, productID)
                    .input('color', sql.NVarChar, color)
                    .input('size', sql.NVarChar, size)
                    .input('stock', sql.Int, stock)
                    .query(`
                        INSERT INTO ProductVariants (ProductID, Color, Size, Stock) 
                        VALUES (@productID, @color, @size, @stock)
                    `);
                console.log(` Inserted new variant: ${color}, ${size}, ${stock}`);
            }
        }

        res.json({ success: true, message: 'Cập nhật sản phẩm thành công!' });

    } catch (err) {
        console.error("Error updating product:", err);
        res.json({ success: false, message: 'Lỗi khi cập nhật sản phẩm: ' + err.message });
    }
});

// Delete Product (DELETE)
router.delete("/admin/products/delete/:id", async (req, res) => {
    try {
        const productID = parseInt(req.params.id);
        let pool = await sql.connect(config);

        // Get product image path before deleting
        let product = await pool.request()
            .input('productID', sql.Int, productID)
            .query('SELECT Image FROM Products WHERE ProductID = @productID');

        if (product.recordset.length === 0) {
            return res.json({ success: false, message: 'Sản phẩm không tồn tại!' });
        }

        const imagePath = product.recordset[0].Image;

        // Delete related records first (to avoid foreign key constraint errors)
        // Must delete in correct order: child tables first, then parent

        // 1. Delete from ShoppingCart first (might reference ProductVariants)
        try {
            await pool.request()
                .input('productID', sql.Int, productID)
                .query('DELETE FROM ShoppingCart WHERE ProductID = @productID');
        } catch (err) {
            console.log('ShoppingCart delete error (ignored):', err.message);
        }

        // 2. Delete from ProductReviews (if exists)
        try {
            await pool.request()
                .input('productID', sql.Int, productID)
                .query('DELETE FROM ProductReviews WHERE ProductID = @productID');
        } catch (err) {
            console.log('ProductReviews delete error (ignored):', err.message);
        }

        // 3. Delete from ProductImages (if exists)
        try {
            await pool.request()
                .input('productID', sql.Int, productID)
                .query('DELETE FROM ProductImages WHERE ProductID = @productID');
        } catch (err) {
            console.log('ProductImages delete error (ignored):', err.message);
        }

        // 4. Delete from ProductVariants
        try {
            await pool.request()
                .input('productID', sql.Int, productID)
                .query('DELETE FROM ProductVariants WHERE ProductID = @productID');
            console.log(' ProductVariants deleted');
        } catch (err) {
            console.log(' ProductVariants delete error:', err.message);
        }

        // 5. Delete from InfoProducts (must be before Products)
        try {
            await pool.request()
                .input('productID', sql.Int, productID)
                .query('DELETE FROM InfoProducts WHERE ProductID = @productID');
            console.log(' InfoProducts deleted');
        } catch (err) {
            console.log(' InfoProducts delete error:', err.message);
        }

        // 6. Finally, delete the product
        await pool.request()
            .input('productID', sql.Int, productID)
            .query('DELETE FROM Products WHERE ProductID = @productID');
        console.log('✅ Products deleted');

        // Delete image file from server (optional)
        if (imagePath && imagePath.startsWith('/assets/uploads/')) {
            const fullPath = path.join(__dirname, '..', imagePath);
            if (fs.existsSync(fullPath)) {
                fs.unlinkSync(fullPath);
            }
        }

        res.json({ success: true, message: 'Xóa sản phẩm thành công!' });

    } catch (err) {
        console.error("Error deleting product:", err);
        res.json({ success: false, message: 'Lỗi khi xóa sản phẩm: ' + err.message });
    }
});

module.exports = router;
