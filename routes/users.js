let express = require('express');
let router = express.Router();
const {register,login, sendRecoveryPassword, updatePassword, updateData} = require("../lib/database");
const jwt = require('jsonwebtoken');
let jwtConfig =  require('../lib/jwt_conf');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const auth = require('../middleware/auth');

// Create directory if it doesn't exist
const dir = './images/company';
if (!fs.existsSync(dir)){
    fs.mkdirSync(dir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'images/company/');
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname)); // Appending timestamp
    }
});

const upload = multer({ storage: storage });

// During user registration
router.post('/register', upload.single('file'), async (req, res) => {
    try {
        let user = req.body;
        let file = req.file;
        let data = JSON.parse(user.data);
        user.data = data;

        if (file) {
            user.data.company = user.data.company || {};
            user.data.company.img = file.path; // Adding file path to company object
        }

        let result = await register(user);
        res.send(result);
    } catch (e){
        console.log('error',e);
        res.send(e)
    }
});

router.post('/login', async function (req, res, next) {
    try
    {
        let username = req.body.email;
        let password = req.body.password;
        let remember = req.body.remember;

        let result = await login(username, password, remember);
        // console.log(result)
        res.send(result);
    }
    catch(e)
    {
        res.send(e);
    }
});


router.post('/recover-password', async function (req, res, next) {
    try
    {
        let email = req.body.email;
        let referer = req.headers.referer;

        let result = await sendRecoveryPassword(email, referer);
        res.send(result);
    }
    catch(e)
    {
        res.send(e);
    }
});

router.post('/update-password', async function (req, res, next) {
    try
    {
        let token = req.body.token;
        let password = req.body.password;

        let result = await updatePassword(password, token);
        res.send(result);
    }
    catch(e)
    {
        res.send(e);
    }
});

router.get('/validate-token', async function (req, res, next) {
    const token = req.header('Authorization').replace('Bearer ', '');
    let result = jwt.verify(token, jwtConfig.secret, {},function (err, decoded) {
        if (err)
        {
            return {
                error: err,
                success: false
            };
        };
        return {
            success: true,
            decoded: decoded
        };
    });
    // console.log(result)
    res.send(result);
});

router.post('/update-data',upload.single('file'), auth.auth, async function (req, res, next) {
    try {

        let file = req.file;
        let data = JSON.parse(req.body.data);
        if (file) {
            data.company = data.company || {};
            data.company.img = file.path; // Adding file path to company object
        }

        let result = await updateData(data, req.data.id);

        result.updated_data = data;
        res.send(result);
    } catch (e){
        console.log('error',e);
        res.send(e)
    }
});

module.exports = router;
