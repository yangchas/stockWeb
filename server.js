const express = require('express');  
const http = require('http');  
const socketIo = require('socket.io');  
//const randomFloat = require('randomatic');  
const redis = require('redis');
// import neatcsv from 'neat-csv';  
//const neatcsv = require('neat-csv')
const csv = require('csv-parser');  
const iconv = require('iconv-lite');  
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');  
const app = express();  
const server = http.createServer(app);  
const io = socketIo(server);  
const bans_info=[]
let clientIds=[]
let connectedClients = 0;
// 客户端池  
const clientPool = new Map(); // 使用 Map 存储客户端的唯一标识符与 Socket 实例 
const timerPool = {  
    stockData: {  
        clients: new Set(), // Track connected clients for this timer  
        intervalId: null, // Store the interval ID  
    },  
    broadcast: {  
        intervalId: null, // Store the broadcast interval ID  
    },  
};  
io.on('connection',(socket)=>{
    const clientId = uuidv4(); 
    clientIds.push(clientId)
    clientPool.set(clientId, socket); // 将客户端 ID 存入池中  
    console.log(`客户端已连接: ${clientId}`); 
    // 发送客户端唯一标识符给客户端  
    socket.emit('client_id', { id: clientId });

    timerPool.stockData.clients.add(socket);  
    // Start timer if no timer is running  
    if (!timerPool.stockData.intervalId) {  
        startStockDataTimer();  
    }  
    socket.on('disconnect',()=>{
        console.log(`客户端已断开: ${clientId}`);  
        // 从池中移除客户端  
        clientPool.delete(clientId); 
        clientIds.pop(clientId)
        // Remove client from the corresponding timer pool  
        timerPool.stockData.clients.delete(socket);  

        // Stop timer if no clients are left  
        if (timerPool.stockData.clients.size === 0) {  
            stopStockDataTimer();  
        }  
    })
    // Handle broadcasting message request  
    socket.on('start_broadcast', () => {  
        console.log('启动广播');  

        // Start broadcast timer if not already started  
        if (!timerPool.broadcast.intervalId) {  
            startBroadcastTimer();  
        }  
    });  
    socket.on('stop_broadcast', () => {  
        console.log('停止广播');  
        stopBroadcastTimer();  
    });  
    socket.on('msg',(data)=>{
        console.log('接受到客户端信息',data)
        socket.emit('msg',{'info':'消息已接收'})
        timerPool.stockData.clients.add(socket);  
        // Start timer if no timer is running  
        if (!timerPool.stockData.intervalId) {  
            startStockDataTimer();  
        }  
        if('ban' in data){
            console.log('发送连板',bans_info.length)
            socket.emit('msg',{'ban':bans_info})
        }else if('buy' in data){
            console.log('购买',data['buy'])
            client.set('buy',data['buy']);
        }else if('msgToAll' in data){
            sendMessageToAll(socket,'大家好，我是jj')
        }else if('msgToOne' in data){
            sendMessageToClient(clientIds[0],'这是个人信息')
            sendMessageToClient(clientIds[1],'这是个人信息')
        }
    })
})
// 函数：向特定客户端发送消息  
function sendMessageToClient(clientId, message) {  
    const socket = clientPool.get(clientId);  
    if (socket) {  
        socket.emit('msg', { message }); // 向特定客户端发送消息  
        console.log(`消息已发送到客户端 ${clientId}`);  
    } else {  
        console.log(`客户端 ${clientId} 不存在`);  
    }  
}  
// 函数：向特定客户端发送消息  
// function sendMessageToAll(message) {  
//     io.emit('msg', { message });
// }  
// 向除发送者外的所有客户端发送消息  
function sendMessageToAll(senderSocket, message) {  
    clientPool.forEach((socket, clientId) => {  
        if (socket !== senderSocket) {  
            socket.emit('msg', { message });  
        }  
    });  
}  
const results = [];
// const stream=fs.createReadStream('D:/software/DTQMT/INFO/HIS/1226/ban1.csv') // 替换为你的 CSV 文件路径
const stream=fs.createReadStream('D:/software/DTQMT/INFO/ban1.csv') // 替换为你的 CSV 文件路径
.pipe(iconv.decodeStream('gbk')).pipe(csv());
stream
.on('data', (data) => results.push(data))
.on('end', () => {
    // console.log(JSON.stringify(results));
    ds=JSON.parse(JSON.stringify(results))
    // bans_info=[]
    for(d in ds){
        // console.log(ds[d]) 
        key=ds[d]['股票代码']
        val={
            'id':ds[d]['股票代码'],
            'name':ds[d]['股票简称'],
            'bans':ds[d]['连续涨停天数'],
            'dde':ds[d]['dde大单净额'],
            'changed':ds[d]['换手率'],
        }
        bans_info.push(val)
    }
    console.log('获取连板信息:',bans_info.length)
    
});

// 创建并配置Redis客户端
const client = redis.createClient(6379,'127.0.0.1');
// 连接到Redis服务器
client.connect()
// .then(()=>{
//     client.get('my_dict').then(val=>{
//         console.log(val)
//       });
// });
// 使用Redis客户端执行操作
client.on('connect', () => {
    console.log('Connected to Redis...');
});
   
client.on('error', (err) => {
    console.log('Error connecting to Redis:', err);
});



async function getRedisValue(key) {
    return await client.get(key);
}


function sendStockData1() {
    getRedisValue('my_dict').then(val=>{
        data=JSON.parse(val)
        if(data){
            for(d in data){
                // console.log((JSON.parse(data[d][Object.keys(data[d])[0]])).length)
                dt=data[d]//单项
                key=Object.keys(data[d])[0]// 个股名称
                vals=JSON.parse(dt[key])
                // console.log("名称：",key," val: ",vals[0])
                volumes=[]
                prices=[]
                times=[]
                
                for (v in vals) {
                    volumes.push(vals[v].volume)
                    prices.push(vals[v].close)
                    times.push(vals[v].stime.slice(8,12))
                    //console.log(vals[v])
                }
                // console.log(key,times)
                io.emit('st_data', {  
                    
                    stock: key,  
                    open: vals[0].open,  
                    preClose: vals[0].preClose,  
                    volume: volumes,  
                    price: prices,  
                    time:times
                    
                });  
            }
        } 
     
    }   
    )
 }
// Function to send broadcast message  
function broadcastMessage() {  
    const message = '这是广播消息: 当前时间是 ' + new Date().toLocaleTimeString();  
    io.emit('msg', { message }); // Emit to all clients  
}  

// Start stock data timer  
function startStockDataTimer() {  
    timerPool.stockData.intervalId = setInterval(sendStockData1, 2000); // 每2秒发送一次数据  
}  

// Stop stock data timer  
function stopStockDataTimer() {  
    clearInterval(timerPool.stockData.intervalId); // 停止定时器  
    timerPool.stockData.intervalId = null; // 重置intervalId  
}  

// Start broadcast timer  
function startBroadcastTimer() {  
    timerPool.broadcast.intervalId = setInterval(broadcastMessage, 5000); // 每5秒发送一次广播消息  
}  

// Stop broadcast timer  
function stopBroadcastTimer() {  
    clearInterval(timerPool.broadcast.intervalId); // 停止定时器  
    timerPool.broadcast.intervalId = null; // 重置intervalId  
}  
// sendStockData1()
// setInterval(sendStockData1, 1000);
// 每分钟发送一次股票数据  
//setInterval(sendStockData, 30000);  

// 提供静态文件服务  
app.use(express.static('public'));  

// 首页路由  
app.get('/', (req, res) => {  
    res.sendFile(__dirname + '/public/index.html');  
});

// 启动服务器  
const PORT = process.env.PORT || 3000;  
server.listen(PORT, () => {  
    console.log(`服务器正在运行在 http://localhost:${PORT}`);  
});