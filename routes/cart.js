const express = require("express");
const router = express.Router();
const { sql, config } = require("../config/db");

router.use(express.json());

// API lưu giỏ hàng vào database - SỬA LẠI
router.post("/api/cart/save", async (req, res) => {
  try {
    const { items, userId } = req.body;

    if (!items || !userId) {
      return res.json({ success: false, message: "Thiếu items hoặc userId" });
    }

    let pool = await sql.connect(config);

    let cartResult = await pool.request()
      .input("userId", sql.Int, userId)
      .query(`SELECT CartID FROM ShoppingCart WHERE UserID = @userId`);

    let cartId = cartResult.recordset.length
      ? cartResult.recordset[0].CartID
      : (await pool.request()
        .input("userId", sql.Int, userId)
        .query(`INSERT INTO ShoppingCart (UserID, CreatedAt)
                OUTPUT INSERTED.CartID
                VALUES (@userId, GETDATE())`)
      ).recordset[0].CartID;

    await pool.request()
      .input("cartId", sql.Int, cartId)
      .query(`DELETE FROM ShoppingCartItems WHERE CartID = @cartId`);

    for (let item of items) {
      //  FIX: Xử lý VariantID NULL nếu = 0 hoặc không có
      const variantId = (item.variantId && item.variantId !== 0) ? item.variantId : null;

      await pool.request()
        .input("cartId", sql.Int, cartId)
        .input("productId", sql.Int, item.id)
        .input("variantId", sql.Int, variantId)
        .input("quantity", sql.Int, item.quantity)
        .query(`
          INSERT INTO ShoppingCartItems (CartID, ProductID, VariantID, Quantity)
          VALUES (@cartId, @productId, @variantId, @quantity)
        `);
    }

    res.json({ success: true });

  } catch (err) {
    console.error("Save cart error:", err);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
});

// API xóa sản phẩm khỏi giỏ hàng - SỬA LẠI
router.post("/api/cart/remove", async (req, res) => {
  try {
    const { productId, variantId, userId } = req.body;

    if (!productId || !userId) {
      return res.json({
        success: false,
        message: "Thiếu dữ liệu productId hoặc userId"
      });
    }

    let pool = await sql.connect(config);

    const cartResult = await pool.request()
      .input("userId", sql.Int, userId)
      .query(`SELECT CartID FROM ShoppingCart WHERE UserID = @userId`);

    if (cartResult.recordset.length === 0) {
      return res.json({ success: true, message: "Không tìm thấy giỏ hàng" });
    }

    const cartId = cartResult.recordset[0].CartID;

    //  FIX: Xử lý VariantID NULL
    const actualVariantId = (variantId && variantId !== 0) ? variantId : null;

    await pool.request()
      .input("cartId", sql.Int, cartId)
      .input("productId", sql.Int, productId)
      .input("variantId", sql.Int, actualVariantId)
      .query(`
        DELETE FROM ShoppingCartItems 
        WHERE CartID = @cartId 
          AND ProductID = @productId
          AND (VariantID = @variantId OR (VariantID IS NULL AND @variantId IS NULL))
      `);

    res.json({ success: true, message: "Đã xóa sản phẩm khỏi giỏ hàng" });

  } catch (err) {
    console.error("Remove cart error:", err);
    res.status(500).json({ success: false, message: "Lỗi server!" });
  }
});

// API cập nhật số lượng - SỬA LẠI
router.post("/api/cart/update-quantity", async (req, res) => {
  try {
    const { productId, variantId, quantity, userId } = req.body;

    if (!productId || !quantity || !userId) {
      return res.json({ success: false, message: "Thiếu dữ liệu" });
    }

    let pool = await sql.connect(config);

    const cartData = await pool.request()
      .input("userId", sql.Int, userId)
      .query(`SELECT CartID FROM ShoppingCart WHERE UserID = @userId`);

    if (cartData.recordset.length === 0)
      return res.json({ success: false });

    const cartId = cartData.recordset[0].CartID;

    // 🔥 FIX: Xử lý VariantID NULL
    const actualVariantId = (variantId && variantId !== 0) ? variantId : null;

    await pool.request()
      .input("cartId", sql.Int, cartId)
      .input("productId", sql.Int, productId)
      .input("variantId", sql.Int, actualVariantId)
      .input("quantity", sql.Int, quantity)
      .query(`
        UPDATE ShoppingCartItems
        SET Quantity = @quantity
        WHERE CartID = @cartId 
          AND ProductID = @productId 
          AND (VariantID = @variantId OR (VariantID IS NULL AND @variantId IS NULL))
      `);

    res.json({ success: true });

  } catch (err) {
    console.error("Update quantity error:", err);
    res.status(500).json({ success: false });
  }
});

// API merge giỏ hàng - SỬA LẠI
router.post("/api/cart/merge", async (req, res) => {
  try {
    const { localItems, userId } = req.body;

    if (!userId) {
      return res.json({ success: false, message: "Thiếu userId" });
    }

    let pool = await sql.connect(config);

    let cartResult = await pool.request()
      .input("userId", sql.Int, userId)
      .query(`SELECT CartID FROM ShoppingCart WHERE UserID = @userId`);

    let cartId = cartResult.recordset.length
      ? cartResult.recordset[0].CartID
      : (await pool.request()
        .input("userId", sql.Int, userId)
        .query(`INSERT INTO ShoppingCart (UserID, CreatedAt)
                        OUTPUT INSERTED.CartID
                        VALUES (@userId, GETDATE())`)
      ).recordset[0].CartID;

    const serverCartResult = await pool.request()
      .input("cartId", sql.Int, cartId)
      .query(`
                SELECT sci.ProductID, sci.VariantID, sci.Quantity 
                FROM ShoppingCartItems sci 
                WHERE sci.CartID = @cartId
            `);

    const serverItems = serverCartResult.recordset;
    const mergedMap = new Map();

    serverItems.forEach(item => {
      const key = `${item.ProductID}-${item.VariantID || 'null'}`;
      mergedMap.set(key, {
        ProductID: item.ProductID,
        VariantID: item.VariantID,
        Quantity: item.Quantity
      });
    });

    localItems.forEach(localItem => {
      //  FIX: Xử lý VariantID NULL
      const localVariantId = (localItem.variantId && localItem.variantId !== 0) ? localItem.variantId : null;
      const key = `${localItem.id}-${localVariantId || 'null'}`;

      if (mergedMap.has(key)) {
        const existing = mergedMap.get(key);
        existing.Quantity += localItem.quantity;
      } else {
        mergedMap.set(key, {
          ProductID: localItem.id,
          VariantID: localVariantId,
          Quantity: localItem.quantity
        });
      }
    });

    const mergedItems = Array.from(mergedMap.values());

    await pool.request()
      .input("cartId", sql.Int, cartId)
      .query(`DELETE FROM ShoppingCartItems WHERE CartID = @cartId`);

    for (let item of mergedItems) {
      await pool.request()
        .input("cartId", sql.Int, cartId)
        .input("productId", sql.Int, item.ProductID)
        .input("variantId", sql.Int, item.VariantID)
        .input("quantity", sql.Int, item.Quantity)
        .query(`
                    INSERT INTO ShoppingCartItems (CartID, ProductID, VariantID, Quantity)
                    VALUES (@cartId, @productId, @variantId, @quantity)
                `);
    }

    const fullCartResult = await pool.request()
      .input("cartId", sql.Int, cartId)
      .query(`
                SELECT 
                    p.ProductID AS id,
                    sci.VariantID AS variantId,
                    p.ProductName AS name,
                    ISNULL(v.Color, '') AS color,
                    ISNULL(v.Size, '') AS size,
                    p.Price AS price,
                    p.Image AS image,
                    sci.Quantity AS quantity
                FROM ShoppingCartItems sci
                JOIN Products p ON p.ProductID = sci.ProductID
                LEFT JOIN ProductVariants v ON v.VariantID = sci.VariantID
                WHERE sci.CartID = @cartId
            `);

    res.json({
      success: true,
      message: "Đã merge giỏ hàng thành công",
      items: fullCartResult.recordset
    });

  } catch (err) {
    console.error("Merge cart error:", err);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
});

// API load giỏ hàng từ database khi user đăng nhập - SỬA LẠI HOÀN TOÀN
router.get("/api/cart/load", async (req, res) => {
  try {
    //  FIX: Lấy userId từ query parameter thay vì session (đáng tin cậy hơn)
    const userId = req.query.userId || req.session.user?.UserID;

    if (!userId) {
      return res.json({ success: false, message: "Chưa đăng nhập", items: [] });
    }

    let pool = await sql.connect(config);

    const result = await pool.request()
      .input("userId", sql.Int, userId)
      .query(`
        SELECT 
          p.ProductID AS id,
          sci.VariantID AS variantId,
          p.ProductName AS name,
          ISNULL(v.Color, '') AS color,
          ISNULL(v.Size, '') AS size,
          p.Price AS price,
          p.Image AS image,
          sci.Quantity AS quantity
        FROM ShoppingCartItems sci
        JOIN ShoppingCart sc ON sc.CartID = sci.CartID
        JOIN Products p ON p.ProductID = sci.ProductID
        LEFT JOIN ProductVariants v ON v.VariantID = sci.VariantID
        WHERE sc.UserID = @userId
      `);

    console.log(' [BACKEND] Loading cart for userId:', userId);
    console.log(' [BACKEND] Cart items from DB:', result.recordset);

    res.json({
      success: true,
      items: result.recordset
    });

  } catch (err) {
    console.error("Load cart error:", err);
    res.json({ success: false, message: "Lỗi server", items: [] });
  }
});

// API thêm sản phẩm vào giỏ hàng - API MỚI QUAN TRỌNG
router.post("/api/cart/add", async (req, res) => {
  try {
    const { productId, variantId, quantity, userId } = req.body;

    console.log('🛍️ [ADD TO CART] Request data:', { productId, variantId, quantity, userId });

    if (!productId || !quantity || !userId) {
      return res.json({ success: false, message: "Thiếu dữ liệu" });
    }

    let pool = await sql.connect(config);

    // Tìm hoặc tạo giỏ hàng
    let cartResult = await pool.request()
      .input("userId", sql.Int, userId)
      .query(`SELECT CartID FROM ShoppingCart WHERE UserID = @userId`);

    let cartId = cartResult.recordset.length
      ? cartResult.recordset[0].CartID
      : (await pool.request()
        .input("userId", sql.Int, userId)
        .query(`INSERT INTO ShoppingCart (UserID, CreatedAt)
                OUTPUT INSERTED.CartID
                VALUES (@userId, GETDATE())`)
      ).recordset[0].CartID;

    // Xử lý variantId - QUAN TRỌNG: không để NULL
    const actualVariantId = (variantId && variantId !== 0) ? variantId : null;

    // Kiểm tra xem sản phẩm đã có trong giỏ chưa
    const existingItem = await pool.request()
      .input("cartId", sql.Int, cartId)
      .input("productId", sql.Int, productId)
      .input("variantId", sql.Int, actualVariantId)
      .query(`
        SELECT ItemID, Quantity FROM ShoppingCartItems 
        WHERE CartID = @cartId AND ProductID = @productId 
        AND (VariantID = @variantId OR (VariantID IS NULL AND @variantId IS NULL))
      `);

    if (existingItem.recordset.length > 0) {
      // Cập nhật số lượng nếu đã tồn tại
      await pool.request()
        .input("itemId", sql.Int, existingItem.recordset[0].ItemID)
        .input("newQuantity", sql.Int, existingItem.recordset[0].Quantity + quantity)
        .query(`UPDATE ShoppingCartItems SET Quantity = @newQuantity WHERE ItemID = @itemId`);
    } else {
      // Thêm mới nếu chưa có
      await pool.request()
        .input("cartId", sql.Int, cartId)
        .input("productId", sql.Int, productId)
        .input("variantId", sql.Int, actualVariantId)
        .input("quantity", sql.Int, quantity)
        .query(`
          INSERT INTO ShoppingCartItems (CartID, ProductID, VariantID, Quantity)
          VALUES (@cartId, @productId, @variantId, @quantity)
        `);
    }

    res.json({ success: true, message: "Đã thêm vào giỏ hàng" });

  } catch (err) {
    console.error("Add to cart error:", err);
    res.status(500).json({ success: false, message: "Lỗi server" });
  }
});

module.exports = router;