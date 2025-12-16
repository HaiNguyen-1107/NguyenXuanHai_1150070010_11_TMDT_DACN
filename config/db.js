const sql = require("mssql");

const config ={

user: "sa",
password: "1107",
server: "127.0.0.1",
port: 60858,
database:"appthoitrang",
  options: {
    encrypt: false,          
    trustServerCertificate: true
  }
};

module.exports = { sql, config };

