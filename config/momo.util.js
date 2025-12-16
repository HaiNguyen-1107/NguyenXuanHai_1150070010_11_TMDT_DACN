const crypto = require("crypto");
const https = require("https");
const config = require("./momo.config");

/**
 * Tạo chữ ký HMAC SHA256 cho MoMo
 * @param {string} data - Chuỗi dữ liệu cần ký
 * @returns {string} Chữ ký hex
 */
function createSignature(data) {
    const hmac = crypto.createHmac("sha256", config.secretKey);
    return hmac.update(data).digest("hex");
}

/**
 * Tạo request ID unique (theo format của MoMo)
 * @param {number} orderId - Mã đơn hàng
 * @returns {string} Request ID unique
 */
function generateRequestId(orderId) {
    const timestamp = Date.now();
    return `${orderId}_${timestamp}`;
}

/**
 * Tạo payment request tới MoMo
 * @param {number} orderId - Mã đơn hàng
 * @param {number} amount - Số tiền (VND)
 * @param {string} orderInfo - Mô tả đơn hàng
 * @returns {Promise<object>} Response từ MoMo API
 */
module.exports.createPayment = async function (orderId, amount, orderInfo) {
    try {
        const requestId = generateRequestId(orderId);
        const orderIdStr = orderId.toString();

        // Tạo raw signature theo thứ tự CHÍNH XÁC của MoMo
        // Format: accessKey=...&amount=...&extraData=...&ipnUrl=...&orderId=...&orderInfo=...&partnerCode=...&redirectUrl=...&requestId=...&requestType=...
        const rawSignature = `accessKey=${config.accessKey}&amount=${amount}&extraData=${config.extraData}&ipnUrl=${config.ipnUrl}&orderId=${orderIdStr}&orderInfo=${orderInfo}&partnerCode=${config.partnerCode}&redirectUrl=${config.redirectUrl}&requestId=${requestId}&requestType=${config.requestType}`;

        const signature = createSignature(rawSignature);

        // Tạo request body
        const requestBody = {
            partnerCode: config.partnerCode,
            partnerName: "Test",
            storeId: "MomoTestStore",
            requestId: requestId,
            amount: amount,
            orderId: orderIdStr,
            orderInfo: orderInfo,
            redirectUrl: config.redirectUrl,
            ipnUrl: config.ipnUrl,
            lang: config.lang,
            extraData: config.extraData,
            requestType: config.requestType,
            signature: signature
        };

        console.log("=== MoMo Payment Request ===");
        console.log("Order ID:", orderId);
        console.log("Amount:", amount, "VND");
        console.log("Request ID:", requestId);
        console.log("Raw Signature:", rawSignature);
        console.log("Signature:", signature);

        // Gửi request tới MoMo
        const response = await sendHttpRequest(config.endpoint, requestBody);

        console.log("=== MoMo Response ===");
        console.log("Result Code:", response.resultCode);
        console.log("Message:", response.message);

        return response;

    } catch (error) {
        console.error("MoMo createPayment error:", error);
        throw error;
    }
};

/**
 * Xác thực chữ ký từ MoMo callback
 * @param {object} data - Dữ liệu từ MoMo
 * @returns {boolean} true nếu hợp lệ
 */
module.exports.verifySignature = function (data) {
    try {
        const {
            partnerCode,
            orderId,
            requestId,
            amount,
            orderInfo,
            orderType,
            transId,
            resultCode,
            message,
            payType,
            responseTime,
            extraData,
            signature
        } = data;

        // Tạo raw signature để verify
        const rawSignature = `accessKey=${config.accessKey}&amount=${amount}&extraData=${extraData}&message=${message}&orderId=${orderId}&orderInfo=${orderInfo}&orderType=${orderType}&partnerCode=${partnerCode}&payType=${payType}&requestId=${requestId}&responseTime=${responseTime}&resultCode=${resultCode}&transId=${transId}`;

        const calculatedSignature = createSignature(rawSignature);

        console.log("=== MoMo Verify Signature ===");
        console.log("Received Signature:", signature);
        console.log("Calculated Signature:", calculatedSignature);
        console.log("Valid:", signature === calculatedSignature);

        return signature === calculatedSignature;

    } catch (error) {
        console.error("MoMo verifySignature error:", error);
        return false;
    }
};

/**
 * Gửi HTTP POST request
 * @param {string} url - URL endpoint
 * @param {object} data - Request body
 * @returns {Promise<object>} Response data
 */
function sendHttpRequest(url, data) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const postData = JSON.stringify(data);

        const options = {
            hostname: urlObj.hostname,
            port: urlObj.port || 443,
            path: urlObj.pathname,
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(postData)
            }
        };

        const req = https.request(options, (res) => {
            let body = "";

            res.on("data", (chunk) => {
                body += chunk;
            });

            res.on("end", () => {
                try {
                    const response = JSON.parse(body);
                    resolve(response);
                } catch (error) {
                    reject(new Error("Invalid JSON response from MoMo"));
                }
            });
        });

        req.on("error", (error) => {
            reject(error);
        });

        req.write(postData);
        req.end();
    });
}
