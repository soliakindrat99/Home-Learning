const express = require('express');
const path = require('path');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const bcrypt = require("bcryptjs");
const nodemailer = require('nodemailer');
const secret = 'mysecrethomelearning';
const app = express();

app.use(express.static('public'));
app.use(cookieParser());
app.use(bodyParser());

app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');


const pg = require('pg');
const pool = new pg.Pool({
    user: 'home_learning_admin',
    host: 'localhost',
    database: 'Home Learning',
    password: '12345',
    port: 5432,
})

var transporter = nodemailer.createTransport({
    host: "smtp-relay.sendinblue.com",
    port: 587,
    secure: false, // upgrade later with STARTTLS
    auth: {
        user: "solomiia.kindrat@gmail.com",
        pass: "OT8L4EXAFHvwU2JV"
    }
});

function encryptPassword(password) {
    return bcrypt.hashSync(password, bcrypt.genSaltSync(5), null);
};

function encryptMessage(message) {
    return bcrypt.hashSync(message);
};

function validPassword(password, stored) {
    return bcrypt.compareSync(password, stored);
};

function validHash(message, stored) {
    return bcrypt.compareSync(message, stored);
};

// index page
app.get('/', auth, (req, res) => {
    if (req.user == undefined) {
        res.render('index', { header: 'header_logout' });
    } else if (req.user.role == 'admin') {
        res.render('index', { header: 'header_admin' });
    } else if (req.user.role == 'student') {
        res.render('index', { header: 'header_student' });
    } else if (req.user.role == 'teacher') {
        res.render('index', { header: 'header_teacher' });
    }
});

app.get('/home_page_student', auth, (req, res) => {
    if (req.user.role == 'student') {
        pool.query(`select subjects.name as sub_name from subjects
        join subject_detail on subjects.id=subject_detail.subject_id
        join groups on groups.id=subject_detail.group_id
        join students on students.group_id=groups.id
        join users on users.id=students.user_id
        where email=$1`, [req.user.email], (error, res_subjects) => {
            if (error) {
                throw error
            }
            res.render('home_page_student', { subjects: res_subjects.rows, header: 'header_student' });
        });

    } else {
        res.redirect('/');
    }
});

app.get('/home_page_teacher', auth, (req, res) => {
    if (req.user.role == 'teacher') {
        pool.query(`select subjects.name as sub_name from subjects
        join subject_detail on subjects.id=subject_detail.subject_id
        join teachers on teachers.id=subject_detail.teacher_id
        join users on users.id=teachers.user_id
        where email=$1
        group by sub_name`, [req.user.email], (error, res_subjects) => {
            if (error) {
                throw error
            }
            res.render('home_page_teacher', { subjects: res_subjects.rows, header: 'header_teacher' });
        });
    } else {
        res.redirect('/');
    }
});

app.get('/profile_admin', auth, (req, res) => {
    pool.query(`select id, first_name, last_name, email from users
                where email=$1`, [req.user.email], (error, result) => {
        if (error) {
            throw error
        }
        pool.query(`select id, name from groups`, (error, res_groups) => {
            if (error) {
                throw error
            }
            pool.query(`select name from subjects`, (error, res_subjects) => {
                if (error) {
                    throw error
                }
                pool.query(`select teachers.id as id, first_name, last_name, email from teachers
                join users on users.id=teachers.user_id`, (error, res_teachers) => {
                    if (error) {
                        throw error
                    }
                    pool.query(`select students.id as id, groups.name, first_name, last_name, email from groups
                        join students on groups.id=students.group_id
                        join users on students.user_id=users.id`, (error, res_groups_of_students) => {
                        if (error) {
                            throw error
                        }
                        pool.query(`select subject_detail.id,users.first_name as user_first_name,users.last_name as user_last_name, 
                        groups.name as group_name,  subjects.name as subject_name from subject_detail 
                        inner join teachers on teachers.id=subject_detail.teacher_id
                        inner join users on users.id=teachers.user_id
                        inner join groups on groups.id=subject_detail.group_id
                        inner join subjects on subjects.id=subject_detail.subject_id`, (error, res_subject_detail) => {
                            if (error) {
                                throw error
                            }
                            if (req.user.role == 'admin') {
                                res.render('profile_admin', {
                                    admin_data: result.rows[0],
                                    groups: res_groups.rows,
                                    subjects: res_subjects.rows,
                                    teachers: res_teachers.rows,
                                    groups_of_students: res_groups_of_students.rows,
                                    subject_detail: res_subject_detail.rows,
                                    header: 'header_admin'
                                });
                            } else {
                                res.redirect('/');
                            }
                        });
                    });
                });
            });
        });
    });
});

app.post('/edit_profile_admin', auth, (req, res) => {
    let user = [
        req.body.first_name,
        req.body.last_name,
        req.body.email,
        req.body.password,
        req.body.repeat_password
    ]
    try {
        if (req.body.password === '') {
            pool.query(`Update users set first_name=$1, last_name=$2, email=$3
             where email=$4`, [user[0], user[1], user[2], req.user.email], (error) => {
                if (error) {
                    throw error
                }
                const token = jwt.sign({ email: req.body.email, role: req.user.role }, secret);
                res.cookie('auth', token);
                res.redirect("/profile_admin");
            });
        } else if (req.body.password === req.body.repeat_password) {
            pool.query(`Update users set first_name=$1, last_name=$2, email=$3, password=$4
             where email=$5`, [user[0], user[1], user[2], encryptPassword(user[3]), req.user.email], (error) => {
                if (error) {
                    throw error
                }
                const token = jwt.sign({ email: req.body.email, role: req.user.role }, secret);
                res.cookie('auth', token);
                res.redirect("/profile_admin");
            });
        }

    } catch (error) {
        res.redirect('/profile_admin');
    }
});

app.post('/add_user', auth, (req, res) => {
    let new_user = [
        req.body.email,
        req.body.role
    ]
    try {
        pool.query("Select id from role where name=$1", [new_user[1]], (error, res_role_id) => {
            if (error) {
                throw error
            }
            pool.query("Select email from users where email=$1", [new_user[0]], (error, result) => {
                if (error) {
                    throw error
                }
                if (result.rows.length == 0) {
                    // const message = {
                    //     from: 'solomiia.kindrat@gmail.com',
                    //     to: new_user[0],
                    //     subject: 'Email from Home Learning',
                    //     text: "It is your hash-code: " + encryptMessage(new_user[0]) + ". You should insert this hash in registration form, if you want to register."
                    // };
                    // transporter.sendMail(message, function(error, info) {
                    //     if (error) {
                    //         console.log(error.message);
                    //         throw error
                    //     } else {
                    //         console.log(info);
                    //     }
                    // });
                    console.log(encryptMessage(new_user[0]));
                    if (req.body.role === "student") {
                        let group_id = 0;
                        pool.query("Select id from groups where name=$1", [req.body.group], (error, res_group_id) => {
                            if (error) {
                                throw error
                            }
                            group_id = res_group_id.rows[0]['id'];
                        });
                        pool.query("Insert into users(email,role_id,hash) values($1,$2,$3);", [new_user[0], res_role_id.rows[0]['id'], encryptMessage(new_user[0])], (error) => {
                            if (error) {
                                throw error
                            }
                            pool.query("Select id from users where email=$1", [new_user[0]], (error, res_user_id) => {
                                console.log('select', res_user_id);
                                if (error) {
                                    throw error
                                }
                                pool.query("Insert into students(user_id, group_id) values($1,$2)", [res_user_id.rows[0]['id'], group_id], (error) => {
                                    if (error) {
                                        throw error
                                    }
                                });
                            });
                        });
                        res.redirect('/profile_admin');
                    } else {
                        pool.query("Insert into users(email,role_id,hash) values($1,$2,$3)", [new_user[0], res_role_id.rows[0]['id'], encryptMessage(new_user[0])], (error) => {
                            if (error) {
                                throw error
                            }
                            pool.query("Insert into teachers (user_id) values($1)", [result.rows[0]['user_id']], (error) => {
                                if (error) {
                                    throw error
                                }
                            });
                            res.redirect('/profile_admin');
                        });
                    }
                } else {
                    console.log('User with this email has already been exist');
                    res.redirect('/profile_admin');
                }
            });

        });
    } catch (error) {
        res.redirect('/profile_admin');
    }

    console.log(new_user);
});

app.post('/create_group', auth, (req, res) => {
    pool.query("Insert into groups(name) values($1)", [req.body.group_name], (error) => {
        if (error) {
            throw error
        }
        res.redirect('/profile_admin');
    })
});

app.post('/create_subject', auth, (req, res) => {
    pool.query("Insert into subjects(name) values($1)", [req.body.subject_name], (error) => {
        if (error) {
            throw error
        }
        res.redirect('/profile_admin');
    })
});

app.post('/add_subject_detail', auth, (req, res) => {
    pool.query("Select id from subjects where name=$1", [req.body.subject], (error, res_subject_id) => {
        if (error) {
            throw error
        }
        pool.query(`select teachers.id as id from teachers
        join users on users.id=teachers.user_id
        where first_name=$1 and last_name=$2`, req.body.teacher.split(' '), (error, res_teacher_id) => {
            if (error) {
                throw error
            }
            pool.query("Select id from groups where name=$1", [req.body.group], (error, res_group_id) => {
                if (error) {
                    throw error
                }
                pool.query("Insert into subject_detail(teacher_id, subject_id, group_id) values($1,$2,$3)", [res_teacher_id.rows[0]['id'], res_subject_id.rows[0]['id'], res_group_id.rows[0]['id']], (error) => {
                    if (error) {
                        throw error
                    }
                    res.redirect('/profile_admin');
                });
            });
        });
    });
});

app.post('/delete_teacher', auth, (req, res) => {
    console.log(req.body.id);
    pool.query("DELETE from teachers where id=$1", [req.body.id], (error) => {
        if (error) {
            throw error
        }
        res.redirect('/profile_admin');
    });
});

app.post('/delete_group', auth, (req, res) => {
    console.log(req.body.id);
    pool.query("DELETE from groups where id=$1", [req.body.id], (error) => {
        if (error) {
            throw error
        }
        res.redirect('/profile_admin');
    });
});

app.post('/delete_student', auth, (req, res) => {
    console.log(req.body.id);
    pool.query("DELETE from students where id=$1", [req.body.id], (error) => {
        if (error) {
            throw error
        }
        res.redirect('/profile_admin');
    });
});

app.post('/update_subject_detail', auth, (req, res) => {
    let subject_id = 0;
    pool.query("SELECT id from subjects where name=$1", [req.body.subject], (error, res_subject) => {
        if (error) {
            throw error
        }
        subject_id = res_subject.rows[0]['id'];
    });
    let group_id = 0;
    pool.query("SELECT id from groups where name=$1", [req.body.group], (error, res_group) => {
        if (error) {
            throw error
        }
        group_id = res_group.rows[0]['id'];
    });
    let teacher_id = 0;
    pool.query(`SELECT teachers.id as id from teachers 
    join users on users.id=teachers.user_id
    where first_name=$1 and last_name=$2`, req.body.teacher.split(' '), (error, res_teacher) => {
        if (error) {
            throw error
        }
        teacher_id = res_teacher.rows[0]['id'];
    });
    pool.query("DELETE from subject_detail where id=$1", [Number(req.body.subject_detail_id)], (error) => {
        if (error) {
            throw error
        }
        pool.query(`INSERT INTO subject_detail(teacher_id, subject_id, group_id) VALUES ($1, $2, $3)`, [teacher_id, subject_id, group_id], (error) => {
            if (error) {
                throw error
            }
            res.redirect('/profile_admin');
        });
    });
});


app.get('/profile_student', auth, (req, res) => {
    pool.query(`select first_name, last_name, email from users
                where email=$1`, [req.user.email], (error, result) => {
        if (error) {
            throw error
        }
        if (req.user.role == 'student') {
            res.render('profile_student', { student_data: result.rows[0], header: 'header_student' });
        } else {
            res.redirect('/');
        }
    })
});
app.post('/edit_profile_student', auth, (req, res) => {
    let user = [
        req.body.first_name,
        req.body.last_name,
        req.body.email,
        req.body.password,
        req.body.repeat_password
    ]
    try {
        if (req.body.password === req.body.repeat_password) {
            pool.query(`Update users set first_name=$1, last_name=$2, email=$3, password=$4
             where email=$5`, [user[0], user[1], user[2], encryptPassword(user[3]), req.user.email], (error) => {
                if (error) {
                    throw error
                }
                const token = jwt.sign({ email: req.body.email, role: req.user.role }, secret);
                res.cookie('auth', token);
                res.redirect("/profile_student");
            });
        }

    } catch (error) {
        res.redirect('/profile_student');
    }
});

app.get('/profile_teacher', auth, (req, res) => {
    pool.query(`select teachers.id as teacher_id, first_name, last_name, email from users
    join teachers on users.id=teachers.user_id
                    where email=$1`, [req.user.email], (error, result) => {
        if (error) {
            throw error
        }
        if (req.user.role == 'teacher') {
            pool.query(`select subject_detail.subject_id, subjects.name from users
            join teachers on teachers.user_id=users.id
            join subject_detail on subject_detail.teacher_id=teachers.id
            join subjects on subjects.id=subject_detail.subject_id
            where email=$1
            group by subjects.name, subject_detail.subject_id`, [req.user.email], (error, res_subjects) => {
                if (error) {
                    throw error
                }
                pool.query(`select groups.name as group_name, users.first_name as user_first_name, users.last_name as user_last_name from groups
                join students on students.group_id=groups.id
                join users on users.id=students.user_id
                order by group_name`, (error, res_groups) => {
                    if (error) {
                        throw error
                    }
                    pool.query(`select groups.name as group_name,  subjects.name as subject_name, 
                    subject_detail.subject_id as subject_id from subject_detail 
                    inner join subjects on subjects.id=subject_detail.subject_id
                    inner join groups on groups.id=subject_detail.group_id
                    where teacher_id=$1`, [result.rows[0]['teacher_id']], (error, res_subject_detail) => {
                        if (error) {
                            throw error
                        }
                        res.render('profile_teacher', {
                            teacher_data: result.rows[0],
                            subjects: res_subjects.rows,
                            groups: res_groups.rows,
                            subject_detail: res_subject_detail.rows,
                            header: 'header_teacher'
                        });
                    });
                });

            });

        } else {
            res.redirect('/');
        }
    })
});
app.post('/edit_profile_teacher', auth, (req, res) => {
    let user = [
        req.body.first_name,
        req.body.last_name,
        req.body.email,
        req.body.password,
        req.body.repeat_password
    ]
    try {
        if (req.body.password === req.body.repeat_password) {
            pool.query(`Update users set first_name=$1, last_name=$2, email=$3, password=$4
             where email=$5`, [user[0], user[1], user[2], encryptPassword(user[3]), req.user.email], (error) => {
                if (error) {
                    throw error
                }
                const token = jwt.sign({ email: req.body.email, role: req.user.role }, secret);
                res.cookie('auth', token);
                res.redirect("/profile_teacher");
            });
        }

    } catch (error) {
        res.redirect('/profile_teacher');
    }

});

function auth(req, res, next) {
    const token = req.cookies['auth'];
    if (token) {
        jwt.verify(token, secret, (err, decoded) => {
            if (err) {
                req.user = undefined;
            } else {
                req.user = decoded;
            }
        });
    }
    next();
};

//sign up

app.get('/sign_up', auth, (req, res) => {
    if (req.user == undefined) {
        res.sendFile(path.join(__dirname + '/public/pages/sign_up.html'));
    } else {
        res.redirect('/');
    }
});

app.post('/sign_up', (req, res) => {
    let user = [
        req.body.first_name,
        req.body.last_name,
        req.body.email,
        req.body.hash,
        req.body.password,
        req.body.repeat_password
    ]
    try {
        if (!validHash(req.body.email, req.body.hash)) {
            console.log("Wrong hash");
        }
        if (req.body.password === req.body.repeat_password && validHash(req.body.email, req.body.hash)) {
            pool.query("Select * from users where email=$1", [user[2]], (error, result) => {
                if (error) {
                    throw error
                }
                if (result.rows.length == 1) {
                    pool.query(`Update users 
                    set first_name=$1, last_name=$2, hash=$3, password=$4 
                    where email=$5`, [user[0], user[1], user[3], encryptPassword(user[4]), user[2]], (error) => {
                        if (error) {
                            throw error
                        }
                        res.redirect('/sign_in');
                    });
                } else {
                    console.log("You have registered");
                }
            });
        } else {
            console.log("Wrong hash or passwords don't match");
        }
    } catch (error) {
        throw error
    }
});

//sign in
app.get('/sign_in', auth, (req, res) => {
    if (req.user == undefined) {
        res.sendFile(path.join(__dirname + '/public/pages/sign_in.html'));
    } else {
        res.redirect('/');
    }
});

app.post('/sign_in', (req, res) => {
    try {
        pool.query(`select password,email,role.name as role from users
        join role on users.role_id=role.id
        where email=$1`, [req.body.email], (error, results) => {
            if (error) {
                console.log(error.message);
            }
            if (results.rows.length == 0) {
                console.log('wrong email!');
            }
            if (!validPassword(req.body.password, results.rows[0]['password'])) {
                console.log('wrong password!');
            } else {
                const token = jwt.sign({ email: results.rows[0]['email'], role: results.rows[0]['role'] }, secret);
                res.cookie('auth', token);
                res.redirect("/");

            }
        });

    } catch (error) {
        res.redirect('/sign_in');
    }
});

app.get('/log_out', auth, (req, res) => {
    res.clearCookie('auth');
    res.redirect('/')
});

app.listen(8080, () => { console.log('8080 server works'); });