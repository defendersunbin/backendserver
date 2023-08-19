const express = require('express')
const ejs = require('ejs')
const app = express()
// 환경변수에서 온 PORT 값을 받기
const port = 3000;
const bodyParser = require('body-parser')
//새로 추가
const axios = require('axios');
const cheerio = require('cheerio');
const bcrypt = require('bcrypt');
const saltRounds = 10;
const jwt = require('jsonwebtoken');
const secretKey = 'tIMEiSwATCH2023!!';
var session = require('express-session')

require('dotenv').config()

const mysql = require('mysql2')
const connection = mysql.createConnection(process.env.DATABASE_URL)
console.log('Connected to PlanetScale!')

connection.query("SET time_zone='Asia/Seoul'");

app.set('view engine','ejs')
app.set('views','./views')
app.engine('ejs', require('ejs').__express);
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname+'/public'));
app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: 'test', cookie: { maxAge: 60000 }, resave:true, saveUninitialized:true, }));

app.use((req, res, next) => {

   res.locals.user_id = "";
   res.locals.name = "";

   if(req.session.member){
      res.locals.user_id = req.session.member.user_id
      res.locals.name = req.session.member.name
   }
   next()
 })



app.get('/', (req, res) => {
   console.log(req.session.member);

   res.render('index')   // ./views/index.ejs
})

app.get('/profile', (req, res) => {
   res.render('profile')
})

app.get('/contact', (req, res) => {
   res.render('contact')
})


app.post('/contactProc', (req, res) => {
   const name = req.body.name;
   const phone = req.body.phone;
   const email = req.body.email;
   const memo = req.body.memo;

   var sql = `insert into contact(name,phone,email,memo,regdate)
   values(?,?,?,?,now() )`

   var values = [name,phone,email,memo];

   connection.query(sql, values, function (err, result){
       if(err) throw err;
       console.log('자료 1개를 삽입하였습니다.');
       res.send("<script> alert('문의사항이 등록되었습니다.'); location.href='/';</script>");
   })

})


app.get('/contactDelete', (req, res) => {
   var idx = req.query.idx
   var sql = `delete from contact where idx='${idx}' `
   connection.query(sql, function (err, result){
      if(err) throw err;

      res.send("<script> alert('삭제되었습니다.'); location.href='/contactList';</script>");
  })
})


app.get('/contactList', (req, res) => {

   var sql = `SELECT * FROM contact ORDER BY idx DESC `
   connection.query(sql, function (err, results, fields){
      if(err) throw err;
      res.render('contactList',{lists:results})
   })

})

app.get('/login', (req, res) => {
   res.render('login')
})


app.post('/loginProc', async (req, res) => {
    const user_id = req.body.user_id;
    const enteredPassword = req.body.pw;

    var sql = `SELECT * FROM member WHERE user_id = ?`;
    var values = [user_id];

    connection.query(sql, values, async function (err, result) {
        if (err) throw err;

        if (result.length == 0) {
            res.send("<script> alert('존재하지 않는 아이디입니다.'); location.href='/login';</script>");
        } else {
            const storedHash = result[0].pw;
            const passwordMatches = await bcrypt.compare(enteredPassword, storedHash);

            if (passwordMatches) {
                const token = jwt.sign({ user_id }, secretKey, {
                    expiresIn: '15m',
                });

                res.cookie('token', token, { httpOnly: true });

                req.session.member = result[0];
                res.send("<script> alert('로그인 되었습니다.'); location.href='/';</script>");
            } else {
                res.send("<script> alert('비밀번호가 일치하지 않습니다.'); location.href='/login';</script>");
            }
        }
    });
});

app.get('/loginedit', (req, res) => {
   res.render('loginedit');
})

app.post('/logineditProc', async (req, res) => {
    const user_id = req.body.user_id;
    const old_pw = req.body.old_pw;
    const new_pw = req.body.new_pw;

    console.log("user_id:", user_id);
    console.log("old_pw:", old_pw);
    console.log("new_pw:", new_pw);

    var sql = `SELECT * FROM member WHERE user_id = ?`
    var values = [user_id];

    connection.query(sql, values, async function (err, result) {
        if (err) throw err;

        if (result.length == 0) {
            res.render('loginedit');
        } else {
            const storedHash = result[0].pw;
            const passwordMatches = await bcrypt.compare(old_pw, storedHash);

            if (!passwordMatches) {
                res.send("<script> alert('이전 비밀번호가 일치하지 않습니다.'); location.href='/loginedit';</script>");
            } else {
                const newHash = await bcrypt.hash(new_pw, saltRounds);
                var updateSql = `UPDATE member SET pw = ? WHERE user_id = ?`;
                var updateValues = [newHash, user_id];

                connection.query(updateSql, updateValues, function (err, result) {
                    if (err) throw err;

                    console.log('비밀번호가 수정되었습니다.');
                    res.send("<script> alert('비밀번호가 수정되었습니다.'); location.href='/';</script>");
                });
            }
        }
    });
});

app.get('/logout', (req, res) => {

    req.session.member = null;
    res.send("<script> alert('로그아웃 되었습니다.'); location.href='/';</script>");

})


app.get('/register', (req, res) => {
   res.render('register')
})


app.post('/register', (req, res) => {
    const user_id = req.body.user_id;
    const pw = req.body.pw;
    const name = req.body.name;

    if (pw.length < 8 || pw.length > 20) {
        res.send("<script> alert('비밀번호는 최소 8자리, 최대 20자리까지 설정해주세요.'); location.href='/register';</script>");
    } else {
        var checkDuplicateSql = `SELECT * FROM member WHERE user_id = ? OR name = ?`;
        var checkDuplicateValues = [user_id, name];

        connection.query(checkDuplicateSql, checkDuplicateValues, function (err, result) {
            if (err) throw err;

            if (result.length > 0) {
                res.send("<script> alert('이미 사용중인 회원입니다.'); location.href='/register';</script>");
            } else {
                bcrypt.hash(pw, saltRounds, function(err, hash) {
                    if (err) throw err;

                    var sql = `INSERT INTO member (user_id, pw, name) VALUES (?, ?, ?)`;
                    var values = [user_id, hash, name];

                    connection.query(sql, values, function (err, result) {
                        if (err) throw err;

                        console.log('회원가입이 완료되었습니다.');

                        const token = jwt.sign({ user_id }, secretKey, {
                            expiresIn: '1h',
                        });

                        console.log('토큰:', token);

                        res.send("<script> alert('회원가입이 완료되었습니다.'); location.href='/login';</script>");
                    });
                });
            }
        });
    }
});


app.get('/addfavorite', (req, res) => {
    res.render('addfavorite');
})


app.post('/addfavoriteProc', (req, res) => {
   const title = req.body.title;
   const code = req.body.code;

   console.log("title:", title);
   console.log("code:", code);

   var sql = `insert into favorites(title, code)
   values(?,?)`

   var values = [title, code];

   connection.query(sql, values, function (err, result){
       if(err) throw err;
       console.log('즐겨찾기 추가');
       res.send("<script> alert('즐겨찾기에 추가하였습니다.'); location.href='/';</script>");
   })

})

app.get('/addfavoriteDelete', (req, res) => {
    var idx = req.query.idx;
    var sql = `delete from favorites where idx='${idx}'`;
    connection.query(sql, function (err, result){
        if(err) throw err;

        res.send("<script> alert('즐겨찾기에서 삭제되었습니다.'); location.href='/addfavoriteList';</script>");
    });
});


app.get('/addfavoriteList', (req, res) => {
    var sql = `select * from favorites order by idx desc`;
    connection.query(sql, function (err, results, fields) {
        if (err) throw err;

        // 배열 생성 및 결과 저장
        let favoriteList = results.map(result => {
            return {
                idx: result.idx,
                title: result.title,
                code: result.code
            };
        });

        res.json({favorites: favoriteList});
    });
});


app.get('/logindeactivate', (req, res) => {
    res.render('logindeactivate');
})

app.post('/logindeactivate', async (req, res) => {
    const { user_id, pw } = req.body;

    // 데이터베이스에서 사용자 찾기
    const sql = 'SELECT * FROM member WHERE user_id = ?';

    connection.query(sql, [user_id], async (err, result) => {
        if (err) throw err;

        if (result.length === 0) {
            res.send("<script> alert('사용자 정보가 일치하지 않습니다.'); location.href='/logindeactivate';</script>");
        } else {
            const storedHash = result[0].pw;
            const passwordMatches = await bcrypt.compare(pw, storedHash);

            if (!passwordMatches) {
                res.send("<script> alert('사용자 정보가 일치하지 않습니다.'); location.href='/logindeactivate';</script>");
            } else {
                const deleteSql = 'DELETE FROM member WHERE user_id = ?';
                connection.query(deleteSql, [user_id], (err, result) => {
                    if (err) throw err;

                    // 로그아웃 처리 - 세션을 초기화합니다.
                    req.session.member = null;

                    res.send("<script> alert('회원탈퇴가 완료되었습니다.'); location.href='/';</script>");
                });
            }
        }
    });
});

app.get('/findname', (req, res) => {
    res.render('findname');
})

app.post('/findname', async (req, res) => {
    const user_id = req.body.user_id;
    const pw = req.body.pw;

    var findNameSql = `SELECT * FROM member WHERE user_id = ?`;
    var findNameValues = [user_id];

    connection.query(findNameSql, findNameValues, async function (err, result) {
        if (err) throw err;

        if (result.length > 0) {
            const storedHash = result[0].pw;
            const passwordMatches = await bcrypt.compare(pw, storedHash);

            if (passwordMatches) {
                const name = result[0].name;
                res.send(`<script> alert('회원님의 이름은 ${name}입니다.'); location.href='/';</script>`);
            } else {
                res.send(`<script> alert('일치하는 회원 정보가 없습니다.'); location.href='/';</script>`);
            }
        } else {
            res.send(`<script> alert('일치하는 회원 정보가 없습니다.'); location.href='/';</script>`);
        }
    });
});

app.get('/findpw', (req, res) => {
    res.render('findpw');
});

app.post('/findpw', async (req, res) => {
    const user_id = req.body.user_id;
    const user_name = req.body.name;

    var sql = `SELECT * FROM member WHERE user_id = ?`;
    var values = [user_id];

    connection.query(sql, values, async function (err, result) {
        if (err) throw err;

        if (result.length == 0) {
            res.send("<script> alert('존재하지 않는 아이디입니다.'); location.href='/findpw';</script>");
        } else {
            if (result[0].name === user_name) {
                // 사용자가 비밀번호를 볼 수 있도록 수정
                const storedPassword = result[0].pw;
                res.send(`<script> alert('입력하신 사용자의 비밀번호는 ${storedPassword} 입니다.'); location.href='/login';</script>`);
            } else {
                res.send("<script> alert('이름이 일치하지 않습니다.'); location.href='/findpw';</script>");
            }
        }
    });
});


app.get('/stocks', (req, res) => {
    res.render('stocks', { stockInfo: null });
});

app.post('/getStockInfo', async (req, res) => {
    const stockName = req.body.stockName;

    // MySQL에서 종목 코드 조회
    const query = 'SELECT stockCode FROM stocks WHERE stockName = ?';
    connection.query(query, [stockName], async (err, results) => {
        if (err) {
            console.error('종목 코드 조회 중 오류 발생:', err);
            res.render('stocks', { stockInfo: null });
            return;
        }

        if (results.length === 0) {
            console.log('해당 종목 이름을 가진 종목을 찾을 수 없습니다.');
            res.render('stocks', { stockInfo: null });
            return;
        }

        const stockCode = results[0].stockCode;
        const url = `https://finance.naver.com/item/main.nhn?code=${stockCode}`;

        try {
            const response = await axios.get(url);
            const $ = cheerio.load(response.data);

            const currentPrice = $('#chart_area > div.rate_info > div > p.no_today > em').text();
            const change = $('#chart_area > div.rate_info > div > p.no_exday > em > span.blind').text();
            const changePercentage = $('#chart_area > div.rate_info > div > p.no_exday > em > span.blind').next().text();

            const stockInfo = {
                stockName: stockName,
                stockCode: stockCode,
                currentPrice: currentPrice,
                change: change,
                changePercentage: changePercentage
            };

            res.render('stocks', { stockInfo: stockInfo });
        } catch (error) {
            console.error('주식 데이터를 가져오는 중 오류 발생:', error);
            res.render('stocks', { stockInfo: null });
        }
    });
});


app.listen(port, () => {
  console.log(`서버가 실행되었습니다.`)
})