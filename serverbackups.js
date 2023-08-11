const express = require('express')
const ejs = require('ejs')
const app = express()
// 환경변수에서 온 PORT 값을 받기
const port = 3000;
const bodyParser = require('body-parser')
//새로 추가
const axios = require('axios');
const cheerio = require('cheerio');
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


app.post('/loginProc', (req, res) => {
   const user_id = req.body.user_id;
   const pw = req.body.pw;

   console.log("user_id:", user_id);
   console.log("pw:", pw);

   var sql = `SELECT * FROM member WHERE user_id = ? AND pw=?`

   var values = [user_id, pw];

   connection.query(sql, values, function (err, result){
       if(err) throw err;

       if(result.length==0){
         res.send("<script> alert('존재하지 않는 아이디입니다..'); location.href='/login';</script>");
       }else{
         console.log(result[0]);

         req.session.member = result[0]
         res.send("<script> alert('로그인 되었습니다.'); location.href='/';</script>");
         //res.send(result);
       }
   })

})



app.get('/logout', (req, res) => {

   req.session.member = null;
   res.send("<script> alert('로그아웃 되었습니다.'); location.href='/';</script>");

})

app.get('/loginedit', (req, res) => {
   res.render('loginedit');
})

app.post('/logineditProc', (req, res) => {
   const user_id = req.body.user_id;
   const old_pw = req.body.old_pw;
   const new_pw = req.body.new_pw;

   console.log("user_id:", user_id);
   console.log("old_pw:", old_pw);
   console.log("new_pw:", new_pw);

   var sql = `SELECT * FROM member WHERE user_id = ?`

   var values = [user_id];

   connection.query(sql, values, function (err, result){
       if(err) throw err;

       if(result.length == 0){
         res.render('loginedit');
       } else if (result[0].pw !== old_pw) {
         res.send("<script> alert('이전 비밀번호가 일치하지 않습니다.'); location.href='/loginedit';</script>");
       } else {
         var updateSql = `UPDATE member SET pw = ? WHERE user_id = ?`;
         var updateValues = [new_pw, user_id];

         connection.query(updateSql, updateValues, function (err, result) {
            if (err) throw err;

            console.log('비밀번호가 수정되었습니다.');
            res.send("<script> alert('비밀번호가 수정되었습니다.'); location.href='/';</script>");
         });
       }
   })
})


app.get('/register', (req, res) => {
   res.render('register')
})


app.post('/register', (req, res) => {
   console.log('함수 추가되었음', (req, res));
   const user_id = req.body.user_id;
   const pw = req.body.pw;
   const name = req.body.name;

   console.log("user_id:", user_id);
   console.log("pw:", pw);
   console.log("name:", name);

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
            var sql = `INSERT INTO member (user_id, pw, name) VALUES (?, ?, ?)`;
            var values = [user_id, pw, name];

            connection.query(sql, values, function (err, result) {
               if (err) throw err;

               console.log('회원가입이 완료되었습니다.');
               res.send("<script> alert('회원가입이 완료되었습니다.'); location.href='/login';</script>");
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
   var idx = req.query.idx
   var sql = `delete from favorites where idx='${idx}' `
   connection.query(sql, function (err, result){
      if(err) throw err;

      res.send("<script> alert('즐겨찾기에서 삭제되었습니다.'); location.href='/addfavoriteList';</script>");
  })
})

app.get('/addfavoriteList', (req, res) => {
   var sql = `SELECT * FROM favorites ORDER BY idx DESC `;
   connection.query(sql, function (err, results, fields){
      if(err) throw err;
      res.json(results);
   });
});

//app.get('/addfavoriteList', (req, res) => {

 //  var sql = `SELECT * FROM favorites ORDER BY idx DESC `
  // connection.query(sql, function (err, results, fields){
  //    if(err) throw err;
      // RowDataPacket 객체를 JSON으로 변환
   //   var jsonData = JSON.stringify(results);

  // 클라이언트에게 JSON 데이터 전송
  //    res.setHeader('Content-Type', 'application/json');
 //     res.send(jsonData);
 //     res.render('addfavoriteList',{lists:results})
//   })

//})

app.get('/logindeactivate', (req, res) => {
    res.render('logindeactivate');
})

app.post('/logindeactivate', (req, res) => {
  const { user_id, pw } = req.body;

  // 데이터베이스에서 사용자 찾기
  const sql = 'DELETE FROM member WHERE user_id = ? AND pw = ?';

  connection.query(sql, [user_id, pw], (err, result) => {
    if (err) throw err;

    if (result.affectedRows === 0) {
      res.send("<script> alert('사용자 정보가 일치하지 않습니다.'); location.href='/logindeactivate';</script>");
    } else {
      res.send("<script> alert('회원탈퇴가 완료되었습니다.'); location.href='/';</script>");
    }
  });
});

app.get('/findname', (req, res) => {
    res.render('findname');
})

app.post('/findname', (req, res) => {
  const user_id = req.body.user_id;
  const pw = req.body.pw;

  var findNameSql = `SELECT name FROM member WHERE user_id = ? AND pw = ?`;
  var findNameValues = [user_id, pw];

  connection.query(findNameSql, findNameValues, function (err, result) {
    if (err) throw err;

    if (result.length > 0) {
      const name = result[0].name;
      res.send(`<script> alert('회원님의 이름은 ${name}입니다.'); location.href='/';</script>`);
    } else {
      res.send(`<script> alert('일치하는 회원 정보가 없습니다.'); location.href='/';</script>`);
    }
  });
});

app.get('/stocks', (req, res) => {
    res.render('stocks', { stockInfo: null });
});

app.post('/getStockInfo', async (req, res) => {
    const stockCode = req.body.stockCode;
    const stockName = req.body.stockName;

    const url = `https://finance.naver.com/item/main.nhn?code=${stockCode}`;

    try {
        const response = await axios.get(url);
        const $ = cheerio.load(response.data);

        const currentPrice = $('#chart_area > div.rate_info > div > p.no_today > em').text();
        const change = $('#chart_area > div.rate_info > div > p.no_exday > em > span.blind').text();
        const changePercentage = $('#chart_area > div.rate_info > div > p.no_exday > em > span.blind').next().text();

        const stockInfo = {
            stockName: stockName,
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

app.listen(port, () => {
  console.log(`서버가 실행되었습니다.`)
})