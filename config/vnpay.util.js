const crypto = require("crypto");
const qs = require("qs");
const config = require("./vnpay.config");

// Hàm sắp xếp object theo key (VNPay yêu cầu)
function sortObject(obj) {
    let sorted = {};
    let keys = Object.keys(obj).sort();
    keys.forEach(key => {
        sorted[key] = obj[key];
    });
    return sorted;
}

// Hàm format ngày giờ theo chuẩn VNPay: yyyyMMddHHmmss
function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${year}${month}${day}${hours}${minutes}${seconds}`;
}

/**
 * Tạo URL thanh toán VNPay
 * @param {number} orderId - Mã đơn hàng
 * @param {number} amount - Số tiền (VND)
 * @param {string} orderInfo - Mô tả đơn hàng
 * @param {string} ipAddr - IP của khách hàng
 * @returns {string} URL thanh toán VNPay
 */
module.exports.createPaymentUrl = function (orderId, amount, orderInfo, ipAddr) {
    const date = new Date();

    const createDate = formatDate(date);
    const expireDate = formatDate(new Date(date.getTime() + 15 * 60000)); // Hết hạn sau 15 phút

    // Tạo params theo chuẩn VNPay
    let vnp_Params = {
        vnp_Version: config.vnp_Version,
        vnp_Command: config.vnp_Command,
        vnp_TmnCode: config.vnp_TmnCode,
        vnp_Locale: config.vnp_Locale,
        vnp_CurrCode: config.vnp_CurrCode,
        vnp_TxnRef: orderId.toString(),
        vnp_OrderInfo: orderInfo,
        vnp_OrderType: config.vnp_OrderType,
        vnp_Amount: Math.round(amount) * 100, // VNPay yêu cầu nhân 100
        vnp_ReturnUrl: config.vnp_ReturnUrl,
        vnp_IpAddr: ipAddr,
        vnp_CreateDate: createDate,
        vnp_ExpireDate: expireDate
    };

    // Sắp xếp params theo alphabet
    vnp_Params = sortObject(vnp_Params);

    // Tạo chữ ký bảo mật
    const signData = qs.stringify(vnp_Params, { encode: false });
    const hmac = crypto.createHmac("sha512", config.vnp_HashSecret);
    const secureHash = hmac.update(Buffer.from(signData, 'utf8')).digest("hex");

    vnp_Params.vnp_SecureHash = secureHash;

    // Tạo URL thanh toán
    const paymentUrl = config.vnp_Url + "?" + qs.stringify(vnp_Params, { encode: true });

    console.log("=== VNPay Payment URL Created ===");
    console.log("Order ID:", orderId);
    console.log("Amount:", amount, "VND");
    console.log("IP:", ipAddr);
    console.log("Return URL:", config.vnp_ReturnUrl);

    return paymentUrl;
};

/**
 * Xác thực chữ ký khi VNPay redirect về
 * @param {object} params - Query params từ VNPay
 * @returns {boolean} true nếu hợp lệ
 */
module.exports.verifyReturn = function (params) {
    try {
        const secureHash = params.vnp_SecureHash;
        const sortedParams = sortObject(params);

        // Xóa các field không tham gia verify
        delete sortedParams.vnp_SecureHash;
        delete sortedParams.vnp_SecureHashType;

        // Tạo chữ ký để so sánh
        const signData = qs.stringify(sortedParams, { encode: false });
        const hmac = crypto.createHmac("sha512", config.vnp_HashSecret);
        const signed = hmac.update(Buffer.from(signData, 'utf8')).digest("hex");

        console.log("=== VNPay Verify ===");
        console.log("Received Hash:", secureHash);
        console.log("Calculated Hash:", signed);
        console.log("Valid:", secureHash === signed);

        return secureHash === signed;
    } catch (error) {
        console.error("VNPay verify error:", error);
        return false;
    }
};