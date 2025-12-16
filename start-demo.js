const ngrok = require('ngrok');

// Load environment variables
require('dotenv').config();

// Import app từ server.js
const app = require('./server');

(async function () {
    try {
        const port = process.env.PORT || 3000;

        console.log('🚀 Starting server for demo...');

        // Start server
        const server = app.listen(port, () => {
            console.log(`📡 Server running on port ${port}`);
        });

        // Start ngrok để tạo public URL
        console.log('🌐 Starting ngrok tunnel...');
        const url = await ngrok.connect({
            addr: port,
            region: 'ap' // Asia Pacific
        });

        console.log('=========================================');
        console.log('🎉 DEMO URL READY!');
        console.log(`🌐 Public URL: ${url}`);

        console.log('🛑 Press Ctrl+C to stop the demo');

    } catch (error) {
        console.error('❌ Failed to start demo:', error);
        process.exit(1);
    }
})();