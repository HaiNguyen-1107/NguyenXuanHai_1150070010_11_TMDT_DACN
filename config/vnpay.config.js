require('dotenv').config();

module.exports = {
    // Thông tin merchant (từ VNPay cung cấp)
    vnp_TmnCode: "2B7KQ9T0",
    vnp_HashSecret: "KARBZVRZJCDIMGYZPFHZJWPiBHTOUWWE",

    // URL VNPay Sandbox (môi trường test)
    vnp_Url: "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html",

    // URL callback khi thanh toán xong (VNPay sẽ redirect về đây)
    vnp_ReturnUrl: "https://curtainless-nonmotivated-cash.ngrok-free.dev/checkout/vnpay_return",

    // Cấu hình chuẩn
    vnp_Version: "2.1.0",
    vnp_Command: "pay",
    vnp_Locale: "vn",
    vnp_CurrCode: "VND",
    vnp_OrderType: "other"
};