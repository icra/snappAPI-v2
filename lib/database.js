const pl = require("nodejs-polars")
let mysql = require("mysql");
const util = require('util');
const dotenv = require('dotenv')
const gl = require("./globals");
const bcrypt = require("bcrypt");
const jwt = require('jsonwebtoken');
let jwtConfig =  require('../lib/jwt_conf');
const nodemailer = require("nodemailer");
const uuid = require('uuid');

dotenv.config()

const openDB = function(){
    let connection = mysql.createPool({
        connectionLimit : 10,
        supportBigNumbers: true,
        bigNumberStrings: true,
        host     : process.env.HOST_DB,
        user     : process.env.DB_USER,
        password : process.env.DB_PASSWORD,
        database : "sannat_v2"
    });

    connection.query = util.promisify(connection.query);

    return connection
}

const connection = openDB()

readSciStudies = function(status = "accepted"){
    return new Promise((resolve, reject) => {
        connection.query(`
             SELECT
             *
             FROM treatment_sci_publication_details
             WHERE validation_status = '${status}'
        `,
        function (err, rows) {
            if(!err){
                if(rows.length) resolve(rows)
                else resolve(null);
            }
            else reject(err);
        });
    });
};

readPublications = function(params){
    return new Promise((resolve, reject) => {

        let query = `
            SELECT
            sci_publications.id AS id,
            sci_publications.type AS type,
            sci_publications.sub_type AS sub_type,
            sci_publications.title AS title,
            sci_publications.doi AS doi,
            sci_publications.year AS year,
            sci_publications.authors AS authors,
            sci_publications.journal AS journal,
            sci_publications.issue AS issue,
            sci_publications.start_page AS start_page,
            sci_publications.end_page AS end_page,
            sci_publications.validation_status AS validation_status,
            sci_publications.email AS email,
            sci_publications.username AS username,
            sci_publications.id_user AS id_user
            
        `;

        let queryParams = [];
        let whereClauses = [];
        // Dynamically add parameters to the WHERE clause if they exist
        if ('status' in params) {
            whereClauses.push(`sci_publications.validation_status = ?`);
            queryParams.push(params.status);
        }

        if ('sub_type' in params) {
            whereClauses.push(`sci_publications.sub_type = ?`);
            queryParams.push(params.sub_type);
        }

        if ('id' in params) {
            whereClauses.push(`sci_publications.id = ?`);
            queryParams.push(params.id);
            query += `  ,treatment_sci_publication_details.code_cs AS code_cs,
                        treatment_sci_publication_details.water_type AS water_type,
                        treatment_sci_publication_details.uws AS uws,
                        treatment_sci_publication_details.bod_in AS bod_in,
                        treatment_sci_publication_details.tn_in AS tn_in,
                        treatment_sci_publication_details.cod_in AS cod_in,
                        treatment_sci_publication_details.no3_in AS no3_in,
                        treatment_sci_publication_details.nh4_in AS nh4_in,
                        treatment_sci_publication_details.tp_in AS tp_in,
                        treatment_sci_publication_details.po43_in AS po43_in,
                        treatment_sci_publication_details.bod_out AS bod_out,
                        treatment_sci_publication_details.tn_out AS tn_out,
                        treatment_sci_publication_details.cod_out AS cod_out,
                        treatment_sci_publication_details.no3_out AS no3_out,
                        treatment_sci_publication_details.nh4_out AS nh4_out,
                        treatment_sci_publication_details.tp_out AS tp_out,
                        treatment_sci_publication_details.po43_out AS po43_out,
                        treatment_sci_publication_details.water_temp AS water_temp,
                        treatment_sci_publication_details.air_temp AS air_temp,
                        treatment_sci_publication_details.ecoli_in AS ecoli_in,
                        treatment_sci_publication_details.ecoli_out AS ecoli_out,
                        treatment_sci_publication_details.heggs_in AS heggs_in,
                        treatment_sci_publication_details.heggs_out AS heggs_out,
                        treatment_sci_publication_details.surface AS surface,
                        treatment_sci_publication_details.hrt AS hrt,
                        treatment_sci_publication_details.inflow AS inflow,
                        treatment_sci_publication_details.outflow AS outflow,
                        treatment_sci_publication_details.population AS population,
                        treatment_sci_publication_details.year_operation AS year_operation,
                        treatment_sci_publication_details.validation_status AS treatment_validation_status,
                        treatment_sci_publication_details.id AS id_treatment
                    FROM
                        sci_publications
                    LEFT JOIN treatment_sci_publication_details ON treatment_sci_publication_details.id_sci_publication = sci_publications.id `
        }
        else
        {
            query += ' FROM sci_publications ';
        }

        if (whereClauses.length > 0) {
            query += ' WHERE ' + whereClauses.join(' AND ');
        }
        connection.query(query, queryParams, function (err, rows) {
            if (!err) {
                if (rows.length) resolve(rows);
                else resolve(null);
            } else reject(err);
        });
    });
};

let sciStudiesToPolars = async function(records = false){

    let db = await readSciStudies("accepted");

    if (records) return db;

    return await pl.readRecords(db);

}


let getTokens = function(){
    return new Promise((resolve, reject) => {
        connection.query(`
             SELECT username, token
             FROM tokens
        `,
            function (err, rows) {
                if(!err){
                    if(rows.length) resolve(rows)
                    else resolve(null);
                }
                else reject(err);
            });
    });
}

const insertTokens = function(username){

    let token = generateToken()

    let query = `
        INSERT INTO tokens (username, token)
        VALUES ('${username}', '${token}')
        `

    return new Promise((resolve, reject) => {
        connection.query(query,
            function (err) {
                if (!err) {
                    resolve(token);
                } else reject (err)
            });
    });
}

const generateToken = function(){
    return rand() + rand()
}
const rand = () => {
    return Math.random().toString(36).slice(2);
};

// Get distinct values from uws column
const getUws = function(){
    return new Promise((resolve, reject) => {
        connection.query(`
             SELECT DISTINCT uws
             FROM all_case_studies
             WHERE uws IS NOT NULL
        `,
            function (err, rows) {
                if(!err){
                    if(rows.length) resolve(rows.map(r => r.uws))
                    else resolve(null);
                }
                else reject(err);
            });
    });
}

const insertTreatmentSciDetails = function(body){

    let queryString = `
            INSERT INTO treatment_sci_publication_details
            (timestamp, validation_status, id_sci_publication,type, sub_type ,water_type, uws, water_temp, air_temp, surface, hrt, inflow, outflow, population, year_operation, 
            ${gl.concentrations.join(", ")})
            VALUES (NOW(),'pending', ${'?, '.repeat(30) + '?'})
        `;

    if(body.id)
    {
        queryString = `
            UPDATE treatment_sci_publication_details
            SET timestamp = NOW(), 
                validation_status = 'pending', 
                id_sci_publication = ?, 
                type = ?, 
                sub_type = ?, 
                water_type = ?, 
                uws = ?, 
                water_temp = ?, 
                air_temp = ?, 
                surface = ?, 
                hrt = ?, 
                inflow = ?, 
                outflow = ?,
                population = ?, 
                year_operation = ?,
                ${gl.concentrations.map(concentration => `${concentration} = ?`).join(", ")}
            WHERE id = ?
        `;
    }

    let values = [
        body.id_sci_publication, body.type, body.sub_type,
        body.water_type, body.uws,
        body.water_temp, body.air_temp,
        body.surface, body.hrt,
        body.inflow, body.outflow,
        body.population, body.year,
        ...gl.concentrations.map(c => body.pollutants[c]),
        body.id
    ]

    values = values.map(value => value === undefined ? null : value);

    return new Promise((resolve, reject) => {
        connection.query(queryString,
            values,
            function (err,response) {
                if (!err) {
                    resolve({
                        success:true,
                        message: "Treatment inserted"
                    });
                } else
                {
                    console.log('error',err);
                    reject (
                        {
                            success: false,
                            error: err,
                            message: 'Something went wrong. Please try again or contact an administrator.'
                        }
                    )
                }
            });
    });
}

const deleteSciStudyDB = function(field, value){
    let queryString = `
            DELETE FROM all_case_studies
            WHERE ${field} = '${value}'
        `
    return new Promise((resolve, reject) => {
        connection.query(queryString,
            function (err) {
                if (!err) {
                    resolve("Case studies deleted");
                } else reject (err)
            });
    });
}

const insertSciPublication = function(body){
    let queryString = `
            INSERT INTO sci_publications
            (type, sub_type, title, doi, year, authors, journal,id_user,validation_status)
            VALUES (${'?, '.repeat(7) + '?'},'editing')
        `;
    let values = [
        body.type, body.sub_type,
        body.title, body.doi, body.year, body.authors, body.journal, body.id_user
    ];

    if(body.id)
    {
        queryString = `
            UPDATE sci_publications
            SET type = ?, 
                sub_type = ?, 
                title = ?, 
                doi = ?, 
                year = ?, 
                authors = ?, 
                journal = ?, 
                validation_status = 'editing'
            WHERE id = ?`;
        values = [
            body.type, body.sub_type,
            body.title, body.doi, body.year, body.authors, body.journal, body.id
        ];
    }



    return new Promise((resolve, reject) => {
        connection.query(queryString,
            values,
            function (err, results) {
                if (!err) {
                    resolve(
                        {
                            success:true,
                            message:"Publication inserted",
                            id: results.insertId
                        }
                    );
                } else reject (
                    {
                        success: false,
                        error: err,
                        message: 'Something went wrong. Please try again or contact an administrator.'
                    }
                )
            });
    });
}

const addRegressionModel = async function(model){
    let checkIfExists = await queryRegressionModel(model.tech, model.pol)
    if (checkIfExists === null){
        return await insertRegressionModel(model)
    } else {
        return await updateRegressionModel(model)
    }
}

const queryRegressionModel = function(tech, pol){
    return new Promise((resolve, reject) => {
        connection.query(`
             SELECT
             *
             FROM regression_models
             WHERE tech = '${tech}' AND poll = '${pol}'
        `,
            function (err, rows) {
                if(!err){
                    if(rows.length) resolve(rows)
                    else resolve(null);
                }
                else reject(err);
            });
    });
}

const queryAllRegressionModels = function(){
    return new Promise((resolve, reject) => {
        connection.query(`
             SELECT
             *
             FROM regression_models
             WHERE null_model is null
        `,
            function (err, rows) {
                if(!err){
                    if(rows.length) resolve(rows)
                    else resolve(null);
                }
                else reject(err);
            });
    });
}

const insertRegressionModel = function(model){
    let queryString = `
            INSERT INTO regression_models
            (poll, tech, type, n, min_load_in, max_load_in, intercept, beta_load_removal, std_error, RMAE, null_model)
            VALUES (${'?, '.repeat(10) + '?'})
        `
    let values = [
        model.pol,
        model.tech,
        model.type,
        model.n,
        model.min_load_in,
        model.max_load_in,
        model.intercept,
        model.beta_load_removal,
        model.std_error,
        model.RMAE,
        model.null_model
    ]

    return new Promise((resolve, reject) => {
        connection.query(queryString,
            values,
            function (err) {
                if (!err) {
                    resolve(`Model for ${model.tech} and ${model.pol} inserted`);
                } else reject (err)
            });
    });
}

const updateRegressionModel = function(model){
    let queryString = `
            UPDATE regression_models
            SET type = ?, n = ?, min_load_in = ?, max_load_in = ?, intercept = ?, beta_load_removal = ?, std_error = ?, RMAE = ?, null_model = ?
            WHERE poll = '${model.pol}' AND tech = '${model.tech}'
        `

    let values = [
        model.type,
        model.n,
        model.min_load_in,
        model.max_load_in,
        model.intercept,
        model.beta_load_removal,
        model.std_error,
        model.RMAE,
        model.null_model
    ]

    return new Promise((resolve, reject) => {
        connection.query(queryString,
            values,
            function (err) {
                if (!err) {
                    resolve(`Model for ${model.tech} and ${model.pol} updated`);
                } else reject (err)
            });
    });
}

const closeDB = function(){
    connection.end()
    return 0
}

let register = function (user) {
    return new Promise((resolve, reject) => {
        bcrypt.hash(user.password, 10, function (err, hash) {
            if (err) {
                console.log(err);
                reject({
                    success: false,
                    error: 'Error hashing password.',
                    message: 'Something went wrong. Please try again or contact an administrator.'
                });
            } else {
                let userData = JSON.stringify(user.data);

                let sql = `INSERT INTO users (email, password, data) VALUES (?, ?, ?);`;
                connection.query(sql, [user.email, hash, userData], function (err, rows) {
                    if (!err) {
                        resolve({
                            success: true,
                            message: 'User registered successfully.'
                        });
                    } else {
                        console.log('error',err);
                        reject({
                            success: false,
                            error: err,
                            message: 'Something went wrong. Please try again or contact an administrator.'
                        });
                    }
                });
            }
        });
    });
}

let login = function (username, password, remember = false) {
    return new Promise((resolve, reject) => {
        connection.query(`
                    SELECT *
                    FROM users
                    WHERE email = '${username}';
            `,
            function (err, rows) {
                if (!err) {
                    if (rows.length) {
                        let user = rows[0];
                        bcrypt.compare(password, user.password, function (err, res) {
                            if (err)
                            {
                                console.log('password incorrect');
                                reject(err);
                            }
                            if (res)
                            {
                                jwt.sign(
                                    {
                                        id: rows[0].id
                                    },
                                    jwtConfig.secret,
                                    {
                                        expiresIn: remember ? '7d' : '1d'
                                    },
                                    function (err, token) {
                                        if (err) reject(err);

                                        connection.query(
                                            `UPDATE users
                                             SET last_login = now()
                                             WHERE id = '${user.id}'`
                                        );
                                        resolve({
                                            message: 'Logged in successfully',
                                            token,
                                            success: true,
                                            user: {
                                                id: user.id,
                                                username: user.username,
                                                email: user.email,
                                                role: user.role,
                                                data: JSON.parse(user.data)
                                            }
                                        });
                                    }
                                );
                            } else {
                                console.log("Password is incorrect", password, user.password);
                                resolve({
                                    message: 'Email or password is incorrect',
                                    success: false,
                                })
                            }
                        });
                    }
                    else
                    {
                        resolve({
                            message: 'Something went wrong',
                            success: false,
                        })
                    }
                }
                else
                {
                    reject(err);
                }
            });
    });
}

let sendRecoveryPassword = function (email,referer) {
    return new Promise((resolve, reject) => {
        connection.query(`
                    SELECT *
                    FROM users
                    WHERE email = '${email}';
            `,
            function (err, rows) {
                if (!err) {
                    if (rows.length) {
                        // create a new object with the data from the database

                        let transporter = nodemailer.createTransport({
                            host: process.env.MAIL_HOST,
                            port: process.env.MAIL_PORT,
                            auth: {
                                user: process.env.MAIL_USER,
                                pass: process.env.MAIL_PASS,
                            },
                        });
                        let token = uuid.v4();
                        connection.query(`INSERT INTO password_token (email,token,created_at) VALUES ('${email}','${token}', now());`,
                            (err, result) => {
                                if (err) {
                                    console.log(err);
                                    reject(err);
                                }
                                else
                                {
                                    var mailOptions = {
                                        from: process.env.MAIL_USER,
                                        to: email,
                                        subject: 'RESET PASSWORD',
                                        html: '<html><body marginheight="0" topmargin="0" marginwidth="0" style="margin: 0px; background-color: #f2f3f8;"> <table cellspacing="0" border="0" cellpadding="0" width="100%" bgcolor="#f2f3f8" style="@import url(https://fonts.googleapis.com/css?family=Rubik:300,400,500,700|Open+Sans:300,400,600,700); font-family: \'Open Sans\', sans-serif;"> <tr> <td> <table style="background-color: #f2f3f8; max-width:670px; margin:0 auto;" width="100%" border="0" align="center" cellpadding="0" cellspacing="0"> <tr> <td style="height:80px;">&nbsp;</td></tr><tr> <td style="height:20px;">&nbsp;</td></tr><tr> <td> <table width="95%" border="0" align="center" cellpadding="0" cellspacing="0" style="max-width:670px;background:#fff; border-radius:3px; text-align:center;-webkit-box-shadow:0 6px 18px 0 rgba(0,0,0,.06);-moz-box-shadow:0 6px 18px 0 rgba(0,0,0,.06);box-shadow:0 6px 18px 0 rgba(0,0,0,.06);"> <tr> <td style="height:40px;">&nbsp;</td></tr><tr> <td style="padding:0 35px;"> <h1 style="color:#1e1e2d; font-weight:500; margin:0;font-size:32px;font-family:\'Rubik\',sans-serif;">You have requested to reset your password</h1> <span style="display:inline-block; vertical-align:middle; margin:29px 0 26px; border-bottom:1px solid #cecece; width:100px;"></span> <p style="color:#455056; font-size:15px;line-height:24px; margin:0;"> To reset your password, click the following link and follow the instructions. </p><a href="'+referer+'recover-password/'+token+'" style="background:#5d8f49;text-decoration:none !important; font-weight:500; margin-top:35px; color:#fff;text-transform:uppercase; font-size:14px;padding:10px 24px;display:inline-block;border-radius:50px;">Reset Password</a> </td></tr><tr> <td style="height:40px;">&nbsp;</td></tr></table> </td><tr> <td style="height:20px;">&nbsp;</td></tr><tr> <td style="text-align:center;"> <p style="font-size:14px; color:rgba(69, 80, 86, 0.7411764705882353); line-height:18px; margin:0 0 0;">&copy; <strong><a href=\'https://snappapi-v2.icradev.cat/\'>snappapi-v2.icradev.cat</<></strong></p></td></tr><tr> <td style="height:80px;">&nbsp;</td></tr></table> </td></tr></table> </body></html>'
                                    };

                                    transporter.sendMail(mailOptions, function(error, info){
                                        if (error) {
                                            resolve({
                                                success: false,
                                                message: 'Something went wrong try again later.'
                                            });
                                        } else {
                                            console.log('Email sent: ' + info.response);
                                            resolve({
                                                success: true,
                                                message: 'Email sended please follow the email link.'
                                            });
                                        }
                                    });
                                }
                            });
                    }
                    else {
                        console.log("User not found", email);
                        resolve({
                            success: false,
                            message: 'Something went wrong.'
                        })
                    };
                } else
                {
                    reject(err);
                }
            });
    });
}

let updatePassword = function (password,token) {
    return new Promise((resolve, reject) => {
        connection.query(
            'SELECT * FROM password_token WHERE token = '+connection.escape(token)+' AND created_at >= NOW() - INTERVAL 1 DAY;',
            (err, result) => {
                if (err)
                {
                    reject(err);
                }
                else if(!result.length) {
                    resolve({
                        message: 'Invalid token',
                        success: false
                    });
                }
                else
                {
                    let email = result[0].email;

                    bcrypt.hash(password, 10, (err, hash) => {
                        if (err)
                        {
                            reject(err);
                        }
                        else {
                            // has hashed pw => add to database
                            connection.query('UPDATE users SET password = '+connection.escape(hash)+' WHERE email = '+connection.escape(email)+';',
                                (err, result) => {
                                    if (err)
                                    {
                                        reject(err);
                                    }
                                    else
                                    {
                                        resolve({
                                            message: 'Password updated!',
                                            success: true
                                        });
                                        connection.query('DELETE FROM password_token WHERE token = '+connection.escape(token),
                                            (err, result) => {
                                                if (err) {
                                                    reject(err);
                                                }
                                                resolve({
                                                    message: 'Password updated!',
                                                    success: true
                                                });
                                            }
                                        );
                                    }
                                }
                            );
                        }
                    });
                }

            });
    });

}

let updateData = function (data, id) {
    return new Promise((resolve, reject) => {
        let userData = JSON.stringify(data);

        let sql = `UPDATE users SET data = ? WHERE id = ?;`;
        connection.query(sql, [userData, id], function (err, rows) {
            if (!err) {
                resolve({
                    success: true,
                    message: 'User updated successfully.'
                });
            } else {
                console.log('error',err);
                reject({
                    success: false,
                    error: err,
                    message: 'Something went wrong. Please try again or contact an administrator.'
                });
            }
        });
    });
}

/**
 * Checks if a publication title already exists in the database.
 * @param {string} title - The title of the publication to check.
 * @param {integer} id - The id of the publication
 * * @returns {Promise<boolean>} - Promise resolving to true if the title exists, false otherwise.
 */
let doesTitleExist = async function (title,id = null) {
    return new Promise((resolve, reject) => {
        // The query to check if the title exists
        let query = `
            SELECT 1
            FROM sci_publications
            WHERE title = ?
            AND validation_status != 'deleted'
        `;
        let data = [title];
        if(id)
        {
            query+=` AND id != ?`
            data.push(id);
        }

        // Execute the query with the title parameter
        connection.query(query,data , function(err, rows) {
            if (!err) {
                // If any row is found, the title exists
                if (rows.length > 0) resolve(true);
                else resolve(false);
            } else {
                // If there's an error executing the query, reject the promise
                reject(err);
            }
        });
    });
}


let doesNameExists = async function (name,id = null) {
    return new Promise((resolve, reject) => {
        // The query to check if the title exists
        let query = `
            SELECT 1
            FROM market_cases
            WHERE name = ?
        `;
        let data = [name];
        if(id)
        {
            query+=` AND id != ?`
            data.push(id);
        }

        // Execute the query with the title parameter
        connection.query(query,data , function(err, rows) {
            if (!err) {
                // If any row is found, the title exists
                if (rows.length > 0) resolve(true);
                else resolve(false);
            } else {
                // If there's an error executing the query, reject the promise
                reject(err);
            }
        });
    });
}
/**
 * Return user in the database.
 * @param {integer} id - User id.
 * @returns {Promise<User>} - Promise resolving user data.
 */
let getUser = async function (id) {
    return new Promise((resolve, reject) => {
        let query = `
            SELECT email, id, role
            FROM users
            WHERE id = ?
        `;
        // Execute the query with the title parameter
        connection.query(query, [id], function(err, rows) {
            if (!err) {
                resolve(rows);
            } else {
                console.log('error',err);
                reject(err);
            }
        });
    });
}

let publishSciPublication = async function(body)
{
    const user = await getUser(body.id_user);
    return new Promise((resolve, reject) => {
        let sql = `SELECT validation_status, email, username, id_user FROM sci_publications WHERE id = ?`;

        connection.query(sql, [body.id_sci_publication], function (err, rows) {
            if (!err && rows.length === 1 && user.length ===1) {
                const publication = rows[0];
                if(publication.id_user !== body.id_user && user[0].role !== 'admin')
                {
                    reject({
                        success: false,
                        error: err,
                        message: 'Forbidden.'
                    });
                }
                else if(publication.validation_status === 'editing')
                {

                    connection.query(`UPDATE sci_publications set validation_status = 'pending' WHERE id = ?`,[body.id_sci_publication],
                        (err, result) => {
                            if (err) {
                                reject({success:false, error: err});
                            }
                            else
                            {
                                resolve({
                                    success: true,
                                    validation_status: 'pending'
                                });
                            }
                        }
                    );
                }
                else if(publication.validation_status === 'pending' && user[0].role === 'admin')
                {
                    connection.query(`UPDATE sci_publications set validation_status = 'accepted' WHERE id = ?`,[body.id_sci_publication],
                        (err, result) => {
                            if (err) {
                                reject({success:false, error: err});
                            }
                            else
                            {
                                resolve({
                                    success: true,
                                    validation_status: 'accepted'
                                });
                            }
                        }
                    );
                }
                else {
                    reject({
                        success: false,
                        error: err,
                        message: 'Something went wrong. Please try again or contact an administrator.'
                    });
                }
            } else {
                reject({
                    success: false,
                    error: err,
                    message: 'Something went wrong. Please try again or contact an administrator.'
                });
            }
        });
    });
}

let publishMarketCase = async function(body)
{
    const user = await getUser(body.id_user);
    return new Promise((resolve, reject) => {
        let sql = `SELECT validation_status, id_user FROM market_cases WHERE id = ?`;

        connection.query(sql, [body.id_market_case], function (err, rows) {
            if (!err && rows.length === 1 && user.length ===1) {
                const publication = rows[0];
                if(publication.id_user !== body.id_user && user[0].role !== 'admin')
                {
                    reject({
                        success: false,
                        error: err,
                        message: 'Forbidden.'
                    });
                }
                else if(publication.validation_status === 'editing')
                {

                    connection.query(`UPDATE market_cases set validation_status = 'pending' WHERE id = ?`,[body.id_market_case],
                        (err, result) => {
                            if (err) {
                                reject({success:false, error: err});
                            }
                            else
                            {
                                resolve({
                                    success: true,
                                    validation_status: 'pending'
                                });
                            }
                        }
                    );
                }
                else if(publication.validation_status === 'pending' && user[0].role === 'admin')
                {
                    connection.query(`UPDATE market_cases set validation_status = 'accepted' WHERE id = ?`,[body.id_market_case],
                        (err, result) => {
                            if (err) {
                                reject({success:false, error: err});
                            }
                            else
                            {
                                resolve({
                                    success: true,
                                    validation_status: 'accepted'
                                });
                            }
                        }
                    );
                }
                else {
                    reject({
                        success: false,
                        error: err,
                        message: 'Something went wrong. Please try again or contact an administrator.'
                    });
                }
            } else {
                reject({
                    success: false,
                    error: err,
                    message: 'Something went wrong. Please try again or contact an administrator.'
                });
            }
        });
    });
}

let publishTreatment = async function(body)
{
    const user = await getUser(body.id_user);
    return new Promise((resolve, reject) => {
        console.log('user',user);
        if(!user.length || user[0].role !== 'admin')
        {
            reject({
                success: false,
                error: err,
                message: 'Forbidden.'
            });
        }

        connection.query(`UPDATE treatment_sci_publication_details set validation_status = 'accepted' WHERE id = ?`,[body.id_treatment],
            (err, result) => {
                if (err) {
                    reject({success:false, error: err});
                }
                else
                {
                    resolve({
                        success: true,
                        validation_status: 'accepted'
                    });
                }
            }
        );
    });
}

let readCases = function(params)
{
    return new Promise((resolve, reject) => {

        let query = `
            SELECT market_cases.id as id, market_cases.id_tech as id_tech, market_cases.technology as tech, market_cases.year_construction as year_construction, market_cases.surface as surface, market_cases.construction_cost as construction_cost, market_cases.location as location,
             market_cases.website as website, market_cases.operational_cost as operational_cost, market_cases.capacity as capacity, market_cases.name as name, market_cases.validation_status as validation_status, market_cases.description as description, market_cases.id_user as id_user, market_cases.img as img, market_cases.last_update
        `;
        query += `  ,JSON_EXTRACT(users.data, '$.company') as company
                    FROM
                        market_cases
                    LEFT JOIN users ON market_cases.id_user = users.id `;

        let queryParams = [];
        let whereClauses = [];
        // Dynamically add parameters to the WHERE clause if they exist
        if ('status' in params) {
            whereClauses.push(`market_cases.validation_status = ?`);
            queryParams.push(params.status);
        }

        if ('id_tech' in params) {
            whereClauses.push(`market_cases.id_tech = ?`);
            queryParams.push(params.id_tech);
        }

        if ('id' in params) {
            whereClauses.push(`market_cases.id = ?`);
            queryParams.push(params.id);

        }

        if (whereClauses.length > 0) {
            query += ' WHERE ' + whereClauses.join(' AND ');
        }
        query+= ' ORDER BY market_cases.last_update DESC';
        connection.query(query, queryParams, function (err, rows) {
            if (!err) {
                rows.forEach(row => {
                    try {
                        row.company = JSON.parse(row.company);
                    } catch (error) {
                        console.error('Error parsing JSON:', error);
                    }
                });

                resolve({
                    success:true,
                    result: rows
                });
            } else
            {
                reject({
                    success: false,
                    error: err,
                    message: 'Something went wrong'
                });
            }
        });
    });
}

let insertMarketCase = function(body)
{
    try
    {
        let queryString = `
            INSERT INTO market_cases
            (id_tech, technology, year_construction,surface,construction_cost,location,website,operational_cost,capacity,description,name,id_user,img,validation_status)
            VALUES (${'?, '.repeat(12) + '?'},'editing')
        `;
        let values = [
            body.id_tech, body.tech, body.year_construction, body.surface, body.construction_cost, body.location,
            body.website, body.operational_cost, body.capacity, body.description, body.name, body.id_user, body.img
        ];

        if(body.id)
        {
            queryString = `
            UPDATE market_cases
            SET year_construction = ?, 
                surface = ?, 
                construction_cost = ?, 
                location = ?, 
                website = ?, 
                operational_cost = ?, 
                capacity = ?, 
                description = ?, 
                name = ?, 
                img = ?, 
                validation_status = 'editing'
            WHERE id = ?`;
            values = [
                body.year_construction, body.surface, body.construction_cost, body.location, body.website, body.operational_cost, body.capacity, body.description, body.name, body.img, body.id
            ];
        }

        return new Promise((resolve, reject) => {
            connection.query(queryString,
                values,
                function (err, results) {
                    console.log(results);
                    if (!err) {
                        resolve(
                            {
                                success:true,
                                message:"Market case inserted",
                                id: results.insertId
                            }
                        );
                    } else
                    {
                        console.log('err',err);
                        reject (
                            {
                                success: false,
                                error: err,
                                message: 'Something went wrong. Please try again or contact an administrator.'
                            }
                        )
                    }
                });
        });
    }
    catch(error)
    {
        return {
            success: false,
            error: error,
            message: 'Something went wrong. Please try again or contact an administrator.'
        }
    }
}

let addScenario =  function(body)
{
    try
    {
        let data = JSON.stringify(body.data);
        let queryString = `
            INSERT INTO scenarios
            (data,id_user)
            VALUES (?,?)
        `;
        let values = [
            data, body.id_user
        ];

        if(body.id)
        {
            queryString = `
            UPDATE scenarios 
            SET data = ? 
            WHERE id = ?`;
            values = [
                data, body.id
            ];
        }

        return new Promise((resolve, reject) => {
            connection.query(queryString,
                values,
                function (err, results) {
                    if (!err) {
                        resolve(
                            {
                                success:true,
                                message: body.id?"Scenario updated":"Scenario inserted",
                                id: results.insertId
                            }
                        );
                    } else
                    {
                        console.log('err',err);
                        reject (
                            {
                                success: false,
                                error: err,
                                message: 'Something went wrong. Please try again or contact an administrator.'
                            }
                        )
                    }
                });
        });
    }
    catch(error)
    {
        return {
            success: false,
            error: error,
            message: 'Something went wrong. Please try again or contact an administrator.'
        }
    }
}

let getScenarios = function(params)
{
    return new Promise((resolve, reject) => {

        let query = `
            SELECT * from scenarios`;

        let queryParams = [];
        let whereClauses = [];

        // Dynamically add parameters to the WHERE clause if they exist
        if ('id' in params) {
            whereClauses.push(`scenarios.id = ?`);
            queryParams.push(params.id);
        }
        if ('id_user' in params) {
            whereClauses.push(`scenarios.id_user = ?`);
            queryParams.push(params.id_user);
        }

        if (whereClauses.length > 0) {
            query += ' WHERE ' + whereClauses.join(' AND ');
        }
        connection.query(query, queryParams, function (err, rows) {
            if (!err) {
                resolve({
                    success:true,
                    result: rows.map((row) => {
                        row.data = JSON.parse(row.data);
                        return row;
                    })
                });
            } else
            {
                reject({
                    success: false,
                    error: err,
                    message: 'Something went wrong'
                });
            }
        });
    });
}

let deleteScenario = function(body)
{
    console.log('delete',body);
    let queryString = `
            DELETE FROM scenarios
            WHERE id = ? AND id_user = ?
        `;
    let values = [body.id,body.id_user];
    console.log(queryString,values);
    return new Promise((resolve, reject) => {
        connection.query(queryString,values,
            function (err,response) {
                console.log(response);
                if (!err) {
                    resolve({
                        success:true,
                    });
                }
                else
                {
                    reject({
                        success: false,
                        error: err,
                        message: 'Something went wrong'
                    });                }
            });
    });
}

let readTreatments = function(params){
    return new Promise((resolve, reject) => {

        let query = `
            SELECT * from treatment_sci_publication_details
            
        `;

        let queryParams = [];
        let whereClauses = [];

        if ('sub_type' in params) {
            whereClauses.push(`sub_type = ?`);
            queryParams.push(params.sub_type);
        }

        if (whereClauses.length > 0) {
            query += ' WHERE ' + whereClauses.join(' AND ');
        }

        console.log('query',query,queryParams);
        connection.query(query, queryParams, function (err, rows) {
            if (!err) {
                resolve({
                    success:true,
                    result: rows

                });
            } else
            {
                reject({
                    success: false,
                    error: err,
                    message: 'Something went wrong'
                });
            }
        });
    });
};

let deleteSciPublication = async function(body)
{
    const user = await getUser(body.id_user);
    return new Promise((resolve, reject) => {
        let sql = `SELECT validation_status, email, username, id_user FROM sci_publications WHERE id = ?`;

        connection.query(sql, [body.id_sci_publication], function (err, rows) {
            if (!err && rows.length === 1 && user.length ===1) {
                const publication = rows[0];
                if(publication.id_user !== body.id_user && user[0].role !== 'admin')
                {
                    reject({
                        success: false,
                        error: err,
                        message: 'Forbidden.'
                    });
                }
                else
                {
                    connection.query(`UPDATE sci_publications set validation_status = 'deleted' WHERE id = ?`,[body.id_sci_publication],
                        (err, result) => {
                            if (err) {
                                reject({success:false, error: err});
                            }
                            else
                            {
                                resolve({
                                    success: true,
                                    validation_status: 'deleted'
                                });
                            }
                        }
                    );
                }
            } else {
                reject({
                    success: false,
                    error: err,
                    message: 'Something went wrong. Please try again or contact an administrator.'
                });
            }
        });
    });
}

module.exports = {
    openDB,
    readSciStudies,
    readPublications,
    deleteSciStudyDB,
    insertTreatmentSciDetails,
    insertSciPublication,
    sciStudiesToPolars,
    getTokens,
    insertTokens,
    closeDB,
    getUws,
    addRegressionModel,
    queryRegressionModel,
    queryAllRegressionModels,
    register,
    login,
    sendRecoveryPassword,
    updatePassword,
    updateData,
    doesTitleExist,
    doesNameExists,
    getUser,
    publishSciPublication,
    publishTreatment,
    readCases,
    insertMarketCase,
    publishMarketCase,
    addScenario,
    getScenarios,
    deleteScenario,
    readTreatments,
    deleteSciPublication
}
