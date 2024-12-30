const express = require('express');  
const http = require('http');  
const socketIo = require('socket.io');  
//const randomFloat = require('randomatic');  
const redis = require('redis');
// import neatcsv from 'neat-csv';  
//const neatcsv = require('neat-csv')
const csv = require('csv-parser');  
const iconv = require('iconv-lite');  
const fs = require('fs');  
const app = express();  
const server = http.createServer(app);  
const io = socketIo(server);  
const bans_info=[]
let connectedClients = 0;

io.on('connection',(socket)=>{
    console.log('客户端已连接')
    connectedClients++
    if (connectedClients === 1) {  
        startTimer();  
    }  
    socket.on('disconnect',()=>{
        console.log('客户端已断开')
        connectedClients--;
        // Stop the timer if this was the last client  
        if (connectedClients === 0) {  
            stopTimer();  
        }  
    })
    socket.on('msg',(data)=>{
        console.log('接受到客户端信息',data)
        if('ban' in data){
            console.log('发送连板',bans_info.length)
            socket.emit('msg',{'ban':bans_info})
        }else if('buy' in data){
            console.log('购买',data['buy'])
            client.set('buy',data['buy']);
       
        }
    })
})

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
function startTimer() {  
    timer = setInterval(sendStockData1, 2000); // Send data every 2 seconds  
}  

function stopTimer() {  
    clearInterval(timer); // Stop the timer  
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