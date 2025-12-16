require('dotenv').config();

module.exports = {
    // Thông tin MoMo Test Sandbox
    partnerCode: "MOMOBKUN20180529",
    accessKey: "klm05TvNBzhg7h7j",
    secretKey: "at67qH6mk8w5Y1nAyMoYKMWACiEi2bsa",

    // MoMo API Endpoints (Test environment)
    endpoint: "https://test-payment.momo.vn/v2/gateway/api/create",

    // URL callback khi thanh toán xong
    // ⚠️ SỬA LẠI URL NÀY KHI DEPLOY (cần ngrok hoặc domain thật)
    redirectUrl: "http://localhost:3000/checkout/momo_return",
    ipnUrl: "http://localhost:3000/checkout/momo_ipn",

    // Cấu hình chuẩn
    requestType: "captureWallet",
    orderInfo: "Thanh toán đơn hàng qua MoMo",
    lang: "vi",
    autoCapture: true,
    extraData: ""
};
