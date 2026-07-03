const express = require('express');
const app = express();
const PORT = 3000;

app.get('/', (req, res) => {
    res.json({ status: true, message: "API is working!" });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
