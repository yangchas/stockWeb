// server.js  
const express = require('express');  
const bodyParser = require('body-parser');  
const neo4j = require('neo4j-driver');  

// Neo4j 配置  
const driver = neo4j.driver('bolt://localhost:7687', neo4j.auth.basic('neo4j', 'test')); // 替换为您的设置  
const session = driver.session();  

const app = express();  
const PORT = process.env.PORT || 3000;  

app.use(bodyParser.json());  
app.use(express.static('public'));  

// 创建股票节点的 API  
app.post('/api/stocks', async (req, res) => {  
    const { name, market_cap, sector } = req.body;  
    const query = `  
        CREATE (s:Stock {name: $name, market_cap: $market_cap, sector: $sector})  
        RETURN s  
    `;  
    try {  
        const result = await session.run(query, { name, market_cap: parseFloat(market_cap), sector });  
        const createdNode = result.records[0].get('s').properties;  
        res.status(201).json(createdNode);  
    } catch (error) {  
        console.error(error);  
        res.status(500).send('Error creating stock node');  
    }  
});  

// 创建新闻节点的 API  
app.post('/api/news', async (req, res) => {  
    const { title, content } = req.body;  
    const query = `  
        CREATE (n:News {title: $title, content: $content})  
        RETURN n  
    `;  
    try {  
        const result = await session.run(query, { title, content });  
        const createdNode = result.records[0].get('n').properties;  
        res.status(201).json(createdNode);  
    } catch (error) {  
        console.error(error);  
        res.status(500).send('Error creating news node');  
    }  
});  

// 创建关系的 API  
app.post('/api/relationships', async (req, res) => {  
    const { stockName, newsTitle } = req.body;  
    const query = `  
        MATCH (s:Stock {name: $stockName}), (n:News {title: $newsTitle})  
        CREATE (s)-[:MENTIONED_IN]->(n)  
    `;  
    try {  
        await session.run(query, { stockName, newsTitle });  
        res.status(201).send('Relationship created');  
    } catch (error) {  
        console.error(error);  
        res.status(500).send('Error creating relationship');  
    }  
});  
// 获取图形数据的 API  
app.get('/api/graph', async (req, res) => {  
    const query = `  
        MATCH (s:Stock)-[:MENTIONED_IN]->(n:News)  
        RETURN s, n  
    `;  
    try {  
        const result = await session.run(query);  
        const nodes = new Set();  
        const edges = [];  

        result.records.forEach(record => {  
            const stock = record.get('s').properties;  
            const news = record.get('n').properties;  

            // 添加股票节点  
            nodes.add({ id: stock.name, label: stock.name, group: 'stock', title: `市值: ${stock.market_cap}\n板块: ${stock.sector}` });  

            // 添加新闻节点  
            nodes.add({ id: news.title, label: news.title, group: 'news', title: `内容: ${news.content}` });  

            // 添加边  
            edges.push({ from: stock.name, to: news.title, label: '提到' });  
        });  

        res.status(200).json({ nodes: Array.from(nodes), edges });  
    } catch (error) {  
        console.error(error);  
        res.status(500).send('Error fetching graph data');  
    }  
});
// 获取所有节点和关系的 API  
app.get('/api/data', async (req, res) => {  
    const query = `  
        MATCH (s:Stock)-[:MENTIONED_IN]->(n:News)  
        RETURN s, n  
    `;  
    try {  
        const result = await session.run(query);  
        const stocks = result.records.map(record => ({  
            stock: record.get('s').properties,  
            news: record.get('n').properties  
        }));  
        res.status(200).json(stocks);  
    } catch (error) {  
        console.error(error);  
        res.status(500).send('Error fetching data');  
    }  
});  

// 启动服务器  
app.listen(PORT, () => {  
    console.log(`Server is running on http://localhost:${PORT}`);  
});  

// 清理连接  
process.on('exit', async () => {  
    await session.close();  
    await driver.close();  
});