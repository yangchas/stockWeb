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
const compression = require('compression')
const fs = require('fs');  
const app = express();  
const server = http.createServer(app);  
// const io = socketIo(server);  
const io = socketIo(server, {  
    cors: {  
      origin: '*', // 根据需要进行更改  
      methods: ['GET', 'POST'],  
    },  
    compress: true, // 启用数据压缩  
    pingInterval: 60000, // 每60秒发送一次Ping  
    pingTimeout: 25000,// 如果在25秒内没有收到Pong，则认为连接失败  
  });  
app.use(compression());
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
    stockTick: {  
        clients: new Set(), // Track connected clients for this timer  
        intervalId: null, // Store the interval ID  
    },  
    stockPlate: {  
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
        // 关闭tick
        if (timerPool.stockTick.clients.size === 0) {  
            stopStockTickTimer();  
        }  
        // 关闭tick
        if (timerPool.stockPlate.clients.size === 0) {  
            stopStockPlateTimer();  
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
        }else if('hisban' in data){
            console.log('发送连板历史行情',bans_info.length)
            sendStockAllData()
        }else if('buy' in data){
            console.log('购买',data['buy'])
            client.set('buy',data['buy']);
        }else if('msgToAll' in data){
            sendMessageToAll(socket,'大家好，我是jj')
        }else if('msgToOne' in data){
            sendMessageToClient(clientIds[0],'这是个人信息')
            sendMessageToClient(clientIds[1],'这是个人信息')
        }else if('tick' in data){
            

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
// 检查文件是否存在
ban_path='D:/software/DTQMT/INFO/ban1.csv'
// ban_path='D:/software/DTQMT/INFO/HIS/16/ban1.csv'
fs.access(ban_path, fs.constants.F_OK, (err) => {
    if (err) {
        console.error(`${ban_path} does not exist`);
        ban_path='D:/software/DTQMT/INFO/HIS/16/ban1.csv'
    //   return;
    }
    const stream=fs.createReadStream(ban_path) // 替换为你的 CSV 文件路径
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
                'amount':ds[d]['amount'],
                'bid':ds[d]['bid'],
                'ask':ds[d]['ask'],
                'pre_price':ds[d]['pre_price'],
                'current_price':ds[d]['current_price'],
            }
            bans_info.push(val)
        }
        console.log('获取连板信息:',bans_info.length)
        
    });
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
    console.error('Error connecting to Redis:', err);
});



async function getRedisValue(key) {
    return await client.get(key);
}


function sendStockAllData() {
    getRedisValue('min_dict').then(val=>{
        data=JSON.parse(val)
        if(data){
            var stdatas=[]
            for(d in data){
                // console.log((JSON.parse(data[d][Object.keys(data[d])[0]])).length)
                dt=data[d]//单项
                key=Object.keys(data[d])[0]// 个股名称
                vals=JSON.parse(dt[key])
                // console.log("名称：",key," val: ",vals[0])
                volumes=[]
                prices=[]
                times=[]
                if(vals[0].lastPrice){
                    // console.log("这是tick")
                    for (v in vals) {
                        // volumes.push(parseInt(vals[v].volume*vals[v].lastPrice*0.01))
                        volumes.push(parseInt(vals[v].amount*0.0001))
                        prices.push(((vals[v].lastPrice-vals[0].lastClose)/vals[0].lastClose*100).toFixed(2))
                        times.push(vals[v].stime.slice(8,12))
                    }
                    volumes=volumes.slice(1).map((num, i) => num - volumes[i])
                    
                    stdatas.push({
                        stock: key,  
                        open: vals[0].open,  
                        preClose: vals[0].lastClose,  
                        volume: volumes,  
                        price: prices,  
                        time:times
                    })
                }else{
                    // console.log("这是1minute")
                    for (v in vals) {
                        volumes.push(parseInt(vals[v].volume*vals[v].close*0.01))
                        prices.push(((vals[v].close-vals[0].preClose)/vals[0].preClose*100).toFixed(2))
                        times.push(vals[v].stime.slice(8,12))
                    }
                    stdatas.push({
                        stock: key,  
                        open: vals[0].open,  
                        preClose: vals[0].preClose,  
                        volume: volumes,  
                        price: prices,  
                        time:times
                    })
                }
            }
            io.emit('msg',{'hisban':stdatas})
        } 
    }   
    )
 }
 function sendStockTickData() {
    getRedisValue('tick_dict').then(val=>{
        data=JSON.parse(val)
        if(data){
            var stdatas=[]
            for(d in data){
                // console.log((JSON.parse(data[d][Object.keys(data[d])[0]])).length)
                dt=data[d]//单项
                key=Object.keys(data[d])[0]// 个股名称
                vals=JSON.parse(dt[key])[0]
                try {
                // console.log("名称：",key," val: ",vals)
          
                    stdatas.push({
                        stock: key,  
                        ask: vals.askVol,  
                        bid: vals.bidVol,
                        amount: parseInt(vals.amount),    
                        price: ((vals.lastPrice-vals.lastClose)/vals.lastClose*100).toFixed(2),  
                        time:vals.stime.slice(8,12)
                    })
                }catch{
                    continue
                }
           
                // stdatas.push([
                //     key,
                //     vals[0].open, 
                //     vals[0].preClose,
                //     parseInt(vals[vals.length-1].volume*vals[vals.length-1].close*0.01),
                //     ((vals[vals.length-1].close-vals[0].preClose)/vals[0].preClose*100).toFixed(2),
                //     vals[vals.length-1].stime.slice(8,12)
                // ])
            }
            io.emit('st_data',stdatas)
        } 
    }   
    )
 }
 function sendStockLastData() {
    getRedisValue('min_dict').then(val=>{
        data=JSON.parse(val)
        if(data){
            var stdatas=[]
            for(d in data){
                // console.log((JSON.parse(data[d][Object.keys(data[d])[0]])).length)
                dt=data[d]//单项
                key=Object.keys(data[d])[0]// 个股名称
                vals=JSON.parse(dt[key])
                // console.log("名称：",key," val: ",vals[0])
                if(vals[0].lastPrice){
                    stdatas.push({
                        stock: key,  
                        open: vals[0].open,  
                        preClose: vals[0].lastClose,
                        volume: parseInt((vals[vals.length-1].amount-vals[vals.length-2].amount)*0.0001),    
                        price: ((vals[vals.length-1].lastPrice-vals[0].lastClose)/vals[0].lastClose*100).toFixed(2),  
                        time:vals[vals.length-1].stime.slice(8,12)
                    })
                }else{
                    stdatas.push({
                        stock: key,  
                        open: vals[0].open,  
                        preClose: vals[0].preClose,  
                        volume: parseInt(vals[vals.length-1].volume*vals[vals.length-1].close*0.01),  
                        price: ((vals[vals.length-1].close-vals[0].preClose)/vals[0].preClose*100).toFixed(2),  
                        time:vals[vals.length-1].stime.slice(8,12)
                    })
                }
           
                // stdatas.push([
                //     key,
                //     vals[0].open, 
                //     vals[0].preClose,
                //     parseInt(vals[vals.length-1].volume*vals[vals.length-1].close*0.01),
                //     ((vals[vals.length-1].close-vals[0].preClose)/vals[0].preClose*100).toFixed(2),
                //     vals[vals.length-1].stime.slice(8,12)
                // ])
            }
            io.emit('st_data',stdatas)
        } 
    }   
    )
 }
 
 function sendStockPlateData() {
    getRedisValue('plate').then(val=>{
        data=JSON.parse(val)
        // console.log(data)
        if(data){
            io.emit('plate',data)
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
    startStockPlateTimer();
    sendStockLastData()
    startStockTickTimer();//启动tick数据

    timerPool.stockData.intervalId = setInterval(sendStockLastData, 6000); // 每2秒发送一次数据  
}  

// Stop stock data timer  
function stopStockDataTimer() {  
    clearInterval(timerPool.stockData.intervalId); // 停止定时器  
    timerPool.stockData.intervalId = null; // 重置intervalId  
}  

// Start stock data timer  
function startStockTickTimer() {  
    timerPool.stockTick.intervalId = setInterval(sendStockTickData, 3000); // 每2秒发送一次数据  
}  

// Stop stock data timer  
function stopStockTickTimer() {  
    clearInterval(timerPool.stockData.intervalId); // 停止定时器  
    timerPool.stockTick.intervalId = null; // 重置intervalId  
}  
// Start stock data timer  
function startStockPlateTimer() {
    sendStockPlateData()
    timerPool.stockPlate.intervalId = setInterval(sendStockPlateData, 30000); // 每2秒发送一次数据  
}  

// Stop stock data timer  
function stopStockPlateTimer() {  
    clearInterval(timerPool.stockPlate.intervalId); // 停止定时器  
    timerPool.stockPlate.intervalId = null; // 重置intervalId  
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