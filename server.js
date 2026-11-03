const express = require('express');
const app = express();
const Port = 4999
app.get('/', (req, res) => {
    console.log('you have reached home');
    res.send('Hello World');
})

app.post('/api/info', (req, res) => {
const {body} = req.body
res.status(201).json({"message": body});
})
app.put('/api', (req, res) => {


})
app.listen(Port, () => console.log(`Server running on port: ${Port}`));
