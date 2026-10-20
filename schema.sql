SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS app_groups (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(60) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_app_groups_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_subjects (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_app_subjects_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_users (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    username VARCHAR(64) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(160) NOT NULL,
    role ENUM('admin','student') NOT NULL,
    group_id INT UNSIGNED NULL,
    active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_app_users_username (username),
    KEY ix_app_users_group_role (group_id, role),
    CONSTRAINT fk_app_users_group FOREIGN KEY (group_id) REFERENCES app_groups(id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_questions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    subject_id INT UNSIGNED NOT NULL,
    question_text TEXT NOT NULL,
    options_json TEXT NOT NULL,
    correct_option TINYINT UNSIGNED NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY ix_app_questions_subject (subject_id),
    CONSTRAINT fk_app_questions_subject FOREIGN KEY (subject_id) REFERENCES app_subjects(id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_exams (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    subject_id INT UNSIGNED NOT NULL,
    group_id INT UNSIGNED NULL,
    title VARCHAR(180) NOT NULL,
    duration_minutes SMALLINT UNSIGNED NOT NULL,
    question_count SMALLINT UNSIGNED NOT NULL,
    active TINYINT(1) NOT NULL DEFAULT 1,
    created_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY ix_app_exams_availability (active, group_id),
    CONSTRAINT fk_app_exams_subject FOREIGN KEY (subject_id) REFERENCES app_subjects(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_app_exams_group FOREIGN KEY (group_id) REFERENCES app_groups(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_app_exams_creator FOREIGN KEY (created_by) REFERENCES app_users(id) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_attempts (
    id CHAR(32) NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    exam_id BIGINT UNSIGNED NOT NULL,
    question_ids_json TEXT NOT NULL,
    answers_json TEXT NOT NULL,
    started_at DATETIME NOT NULL,
    ends_at DATETIME NOT NULL,
    status ENUM('active','completed') NOT NULL DEFAULT 'active',
    PRIMARY KEY (id),
    KEY ix_app_attempts_user_status (user_id, status),
    UNIQUE KEY uq_app_attempts_user_exam (user_id, exam_id),
    CONSTRAINT fk_app_attempts_user FOREIGN KEY (user_id) REFERENCES app_users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_app_attempts_exam FOREIGN KEY (exam_id) REFERENCES app_exams(id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_results (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    attempt_id CHAR(32) NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    exam_id BIGINT UNSIGNED NOT NULL,
    correct_count SMALLINT UNSIGNED NOT NULL,
    total_count SMALLINT UNSIGNED NOT NULL,
    percent TINYINT UNSIGNED NOT NULL,
    grade VARCHAR(40) NOT NULL,
    completed_at DATETIME NOT NULL,
    expired TINYINT(1) NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    UNIQUE KEY uq_app_results_attempt (attempt_id),
    UNIQUE KEY uq_app_results_user_exam (user_id, exam_id),
    KEY ix_app_results_user_date (user_id, completed_at),
    KEY ix_app_results_exam_date (exam_id, completed_at),
    CONSTRAINT fk_app_results_attempt FOREIGN KEY (attempt_id) REFERENCES app_attempts(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_app_results_user FOREIGN KEY (user_id) REFERENCES app_users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_app_results_exam FOREIGN KEY (exam_id) REFERENCES app_exams(id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE app_subjects (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_app_subjects_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE app_users (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    username VARCHAR(64) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(160) NOT NULL,
    role ENUM('admin','student') NOT NULL,
    group_id INT UNSIGNED NULL,
    active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_app_users_username (username),
    KEY ix_app_users_group_role (group_id, role),
    CONSTRAINT fk_app_users_group FOREIGN KEY (group_id) REFERENCES app_groups(id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE app_questions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    subject_id INT UNSIGNED NOT NULL,
    question_text TEXT NOT NULL,
    options_json TEXT NOT NULL,
    correct_option TINYINT UNSIGNED NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY ix_app_questions_subject (subject_id),
    CONSTRAINT fk_app_questions_subject FOREIGN KEY (subject_id) REFERENCES app_subjects(id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE app_exams (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    subject_id INT UNSIGNED NOT NULL,
    group_id INT UNSIGNED NULL,
    title VARCHAR(180) NOT NULL,
    duration_minutes SMALLINT UNSIGNED NOT NULL,
    question_count SMALLINT UNSIGNED NOT NULL,
    active TINYINT(1) NOT NULL DEFAULT 1,
    created_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY ix_app_exams_availability (active, group_id),
    CONSTRAINT fk_app_exams_subject FOREIGN KEY (subject_id) REFERENCES app_subjects(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_app_exams_group FOREIGN KEY (group_id) REFERENCES app_groups(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_app_exams_creator FOREIGN KEY (created_by) REFERENCES app_users(id) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE app_attempts (
    id CHAR(32) NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    exam_id BIGINT UNSIGNED NOT NULL,
    question_ids_json TEXT NOT NULL,
    answers_json TEXT NOT NULL,
    started_at DATETIME NOT NULL,
    ends_at DATETIME NOT NULL,
    status ENUM('active','completed') NOT NULL DEFAULT 'active',
    PRIMARY KEY (id),
    KEY ix_app_attempts_user_status (user_id, status),
    UNIQUE KEY uq_app_attempts_user_exam (user_id, exam_id),
    CONSTRAINT fk_app_attempts_user FOREIGN KEY (user_id) REFERENCES app_users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_app_attempts_exam FOREIGN KEY (exam_id) REFERENCES app_exams(id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE app_results (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    attempt_id CHAR(32) NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    exam_id BIGINT UNSIGNED NOT NULL,
    correct_count SMALLINT UNSIGNED NOT NULL,
    total_count SMALLINT UNSIGNED NOT NULL,
    percent TINYINT UNSIGNED NOT NULL,
    grade VARCHAR(40) NOT NULL,
    completed_at DATETIME NOT NULL,
    expired TINYINT(1) NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    UNIQUE KEY uq_app_results_attempt (attempt_id),
    UNIQUE KEY uq_app_results_user_exam (user_id, exam_id),
    KEY ix_app_results_user_date (user_id, completed_at),
    KEY ix_app_results_exam_date (exam_id, completed_at),
    CONSTRAINT fk_app_results_attempt FOREIGN KEY (attempt_id) REFERENCES app_attempts(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_app_results_user FOREIGN KEY (user_id) REFERENCES app_users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_app_results_exam FOREIGN KEY (exam_id) REFERENCES app_exams(id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO app_groups (name) VALUES ('2-101');
INSERT INTO app_subjects (name) VALUES ('Асосҳои ҳуқуқ'),('Омодагии касбӣ'),('Таърихи халқи тоҷик');

INSERT INTO app_questions (subject_id, question_text, options_json, correct_option) VALUES
((SELECT id FROM app_subjects WHERE name='Асосҳои ҳуқуқ'),'Конститутсияи Ҷумҳурии Тоҷикистон кай қабул шудааст?','["6 ноябри соли 1994","9 сентябри соли 1991","27 июни соли 1997","16 ноябри соли 1992"]',0),
((SELECT id FROM app_subjects WHERE name='Асосҳои ҳуқуқ'),'Ҳокимияти давлатӣ дар Ҷумҳурии Тоҷикистон ба кадом шохаҳо ҷудо мешавад?','["Қонунгузор, иҷроия ва судӣ","Марказӣ ва маҳаллӣ","Ҳарбӣ ва шаҳрвандӣ","Давлатӣ ва хусусӣ"]',0),
((SELECT id FROM app_subjects WHERE name='Асосҳои ҳуқуқ'),'Сарчашмаи асосии ҳуқуқи конститутсионӣ кадом аст?','["Конститутсия","Фармони вазорат","Қарори корхона","Шартномаи шаҳрвандӣ"]',0),
((SELECT id FROM app_subjects WHERE name='Асосҳои ҳуқуқ'),'Мақсади асосии қонуният дар давлат чист?','["Таъмини риояи қонун аз ҷониби ҳама","Танҳо танзими фаъолияти суд","Маҳдуд кардани ҳуқуқи шаҳрвандон","Иваз намудани мақомоти давлатӣ"]',0),
((SELECT id FROM app_subjects WHERE name='Асосҳои ҳуқуқ'),'Ҳуқуқу озодиҳои инсон дар кадом санади асосӣ кафолат дода мешаванд?','["Конститутсияи Ҷумҳурии Тоҷикистон","Қоидаҳои дохилии муассиса","Низомномаи гурӯҳ","Нақшаи таълимӣ"]',0),
((SELECT id FROM app_subjects WHERE name='Асосҳои ҳуқуқ'),'Кадом мақом адолати судиро амалӣ мекунад?','["Суд","Вазорат","Маҷлиси маҳаллӣ","Муассисаи таълимӣ"]',0),
((SELECT id FROM app_subjects WHERE name='Омодагии касбӣ'),'Ҳангоми муроҷиат ба шаҳрванд корманди милитсия пеш аз ҳама бояд чӣ кор кунад?','["Худро муаррифӣ намояд","Ҳуҷҷатро бе шарҳ талаб кунад","Суҳбатро қатъ кунад","Шаҳрвандро ба дигар ҷой фиристад"]',0),
((SELECT id FROM app_subjects WHERE name='Омодагии касбӣ'),'Дар муоширати касбӣ кадом хислат муҳим аст?','["Хушмуомилагӣ ва эҳтиром","Шитобкорӣ","Бетафовутӣ","Сахтгирии беасос"]',0),
((SELECT id FROM app_subjects WHERE name='Омодагии касбӣ'),'Ҳангоми расидан ба ҷойи ҳодиса аввалин вазифаи корманд чист?','["Арзёбии вазъ ва таъмини амният","Ҷамъоварии маълумоти расонаӣ","Тарки ҷойи ҳодиса","Пурсиши ҳамаи ҳозирон ҳамзамон"]',0),
((SELECT id FROM app_subjects WHERE name='Омодагии касбӣ'),'Маълумоти хизматӣ бояд чӣ гуна истифода шавад?','["Танҳо дар доираи ваколатҳои хизматӣ","Дар шабакаҳои иҷтимоӣ","Бе маҳдудият ба дигарон дода шавад","Барои манфиати шахсӣ"]',0),
((SELECT id FROM app_subjects WHERE name='Таърихи халқи тоҷик'),'Истиқлолияти давлатии Ҷумҳурии Тоҷикистон кай эълон гардид?','["9 сентябри соли 1991","6 ноябри соли 1994","27 июни соли 1997","1 сентябри соли 1991"]',0),
((SELECT id FROM app_subjects WHERE name='Таърихи халқи тоҷик'),'Пойтахти Ҷумҳурии Тоҷикистон кадом шаҳр аст?','["Душанбе","Хуҷанд","Бохтар","Кӯлоб"]',0),
((SELECT id FROM app_subjects WHERE name='Таърихи халқи тоҷик'),'Рӯзи Ваҳдати миллӣ дар Тоҷикистон кадом сана таҷлил мешавад?','["27 июн","9 сентябр","6 ноябр","1 май"]',0),
((SELECT id FROM app_subjects WHERE name='Таърихи халқи тоҷик'),'Кадом забон мақоми забони давлатии Ҷумҳурии Тоҷикистонро дорад?','["Забони тоҷикӣ","Забони русӣ","Забони англисӣ","Забони ӯзбекӣ"]',0),
((SELECT id FROM app_subjects WHERE name='Асосҳои ҳуқуқ'),'Вазифаи асосии мақомоти ҳифзи ҳуқуқ кадом аст?','["Ҳифзи ҳуқуқу озодиҳои шаҳрвандон ва тартиботи ҷамъиятӣ","Танзими барномаҳои таълимӣ","Идоракунии муассисаҳои тиббӣ","Таъйини нархи молҳо"]',0);

INSERT INTO app_exams (subject_id, group_id, title, duration_minutes, question_count, active) VALUES
((SELECT id FROM app_subjects WHERE name='Асосҳои ҳуқуқ'),(SELECT id FROM app_groups WHERE name='2-101'),'Асосҳои ҳуқуқ',30,5,1),
((SELECT id FROM app_subjects WHERE name='Омодагии касбӣ'),(SELECT id FROM app_groups WHERE name='2-101'),'Омодагии касбӣ',25,4,1),
((SELECT id FROM app_subjects WHERE name='Таърихи халқи тоҷик'),(SELECT id FROM app_groups WHERE name='2-101'),'Таърихи халқи тоҷик',30,4,1);
