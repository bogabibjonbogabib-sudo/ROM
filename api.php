<?php
declare(strict_types=1);

$config = require __DIR__ . '/config.php';
date_default_timezone_set('UTC');
$secure = isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
session_name('imtiho_session');
session_set_cookie_params(['httponly' => true, 'secure' => $secure, 'samesite' => 'Lax', 'path' => '/']);
session_start();
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate');
header('X-Content-Type-Options: nosniff');

function respond(array $payload, int $status = 200): void {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

function db(array $config): PDO {
    static $pdo = null;
    if ($pdo instanceof PDO) return $pdo;
    $pdo = new PDO(
        'mysql:host=' . $config['db_host'] . ';dbname=' . $config['db_name'] . ';charset=utf8mb4',
        $config['db_user'],
        $config['db_password'],
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
            PDO::ATTR_TIMEOUT => 10,
            PDO::MYSQL_ATTR_INIT_COMMAND => 'SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci',
            PDO::MYSQL_ATTR_USE_BUFFERED_QUERY => true,
        ]
    );
    return $pdo;
}

function input(): array {
    $decoded = json_decode((string)file_get_contents('php://input'), true);
    return is_array($decoded) ? $decoded : [];
}

function csrf_check(): void {
    $sent = (string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
    if (empty($_SESSION['csrf']) || !hash_equals((string)$_SESSION['csrf'], $sent)) {
        respond(['error' => 'Дархост тасдиқ нашуд. Саҳифаро нав кунед.'], 403);
    }
}

function current_user(PDO $pdo): ?array {
    $userId = $_SESSION['user_id'] ?? null;
    if (!$userId) return null;
    $statement = $pdo->prepare('SELECT u.id,u.username,u.full_name,u.role,g.name AS group_name FROM app_users u LEFT JOIN app_groups g ON g.id=u.group_id WHERE u.id=:id AND u.active=1');
    $statement->execute(['id' => $userId]);
    $user = $statement->fetch();
    if (!$user) { unset($_SESSION['user_id']); return null; }
    return ['id' => (string)$user['id'], 'username' => $user['username'], 'name' => $user['full_name'], 'role' => $user['role'], 'group' => $user['group_name'] ?? ''];
}

function require_user(PDO $pdo): array {
    $user = current_user($pdo);
    if (!$user) respond(['error' => 'Барои идома ворид шавед.'], 401);
    return $user;
}

function require_admin(array $user): void {
    if ($user['role'] !== 'admin') respond(['error' => 'Ин амал танҳо барои администратор иҷозат аст.'], 403);
}

function decode_json(string $value, array $fallback = []): array {
    $decoded = json_decode($value, true);
    return is_array($decoded) ? $decoded : $fallback;
}

function grade_for(int $percent): string {
    if ($percent >= 90) return 'Аъло';
    if ($percent >= 75) return 'Хуб';
    if ($percent >= 60) return 'Қаноатбахш';
    return 'Ғайриқаноатбахш';
}

function timestamp_ms(string $value): int {
    return (int)(strtotime($value . ' UTC') * 1000);
}

function finalize_attempt(PDO $pdo, array $attempt): void {
    $questionIds = array_map('intval', decode_json($attempt['question_ids_json']));
    if (!$questionIds) throw new RuntimeException('Attempt has no questions.');
    $placeholders = implode(',', array_fill(0, count($questionIds), '?'));
    $statement = $pdo->prepare("SELECT id,correct_option FROM app_questions WHERE id IN ($placeholders)");
    $statement->execute($questionIds);
    $correct = 0;
    $total = 0;
    $answers = decode_json($attempt['answers_json']);
    foreach ($statement->fetchAll() as $question) {
        $total++;
        if (isset($answers[(string)$question['id']]) && (int)$answers[(string)$question['id']] === (int)$question['correct_option']) $correct++;
    }
    if ($total === 0) throw new RuntimeException('Attempt questions are no longer available.');
    $percent = (int)round($correct / $total * 100);
    $expired = strtotime($attempt['ends_at'] . ' UTC') <= time();
    $result = $pdo->prepare('INSERT INTO app_results (attempt_id,user_id,exam_id,correct_count,total_count,percent,grade,completed_at,expired) VALUES (:attempt,:user,:exam,:correct,:total,:percent,:grade,:completed,:expired)');
    $result->execute(['attempt' => $attempt['id'], 'user' => $attempt['user_id'], 'exam' => $attempt['exam_id'], 'correct' => $correct, 'total' => $total, 'percent' => $percent, 'grade' => grade_for($percent), 'completed' => gmdate('Y-m-d H:i:s'), 'expired' => $expired ? 1 : 0]);
    $update = $pdo->prepare("UPDATE app_attempts SET status='completed' WHERE id=:id");
    $update->execute(['id' => $attempt['id']]);
}

function get_exam(PDO $pdo, int $examId): ?array {
    $statement = $pdo->prepare('SELECT e.id,e.title,e.duration_minutes,e.question_count,e.active,s.name AS subject,g.name AS group_name,(SELECT COUNT(*) FROM app_questions q WHERE q.subject_id=e.subject_id) AS available_count FROM app_exams e JOIN app_subjects s ON s.id=e.subject_id LEFT JOIN app_groups g ON g.id=e.group_id WHERE e.id=:id');
    $statement->execute(['id' => $examId]);
    $exam = $statement->fetch();
    if (!$exam) return null;
    return ['id' => (string)$exam['id'], 'title' => $exam['title'], 'subject' => $exam['subject'], 'minutes' => (int)$exam['duration_minutes'], 'count' => (int)$exam['question_count'], 'availableCount' => (int)$exam['available_count'], 'group' => $exam['group_name'] ?? '', 'active' => (bool)$exam['active']];
}

function active_attempt(PDO $pdo, array $user): ?array {
    if ($user['role'] !== 'student') return null;
    $statement = $pdo->prepare("SELECT a.*,e.title,s.name AS subject,e.duration_minutes FROM app_attempts a JOIN app_exams e ON e.id=a.exam_id JOIN app_subjects s ON s.id=e.subject_id WHERE a.user_id=:user AND a.status='active' ORDER BY a.started_at DESC LIMIT 1");
    $statement->execute(['user' => $user['id']]);
    $row = $statement->fetch();
    if (!$row) return null;

    $questionIds = array_map('intval', decode_json($row['question_ids_json']));
    if (!$questionIds) return null;
    $placeholders = implode(',', array_fill(0, count($questionIds), '?'));
    $questionStatement = $pdo->prepare("SELECT id,question_text,options_json FROM app_questions WHERE id IN ($placeholders)");
    $questionStatement->execute($questionIds);
    $byId = [];
    foreach ($questionStatement->fetchAll() as $question) {
        $byId[(int)$question['id']] = ['id' => (string)$question['id'], 'subject' => $row['subject'], 'text' => $question['question_text'], 'options' => decode_json($question['options_json'])];
    }
    $questions = [];
    foreach ($questionIds as $questionId) if (isset($byId[$questionId])) $questions[] = $byId[$questionId];
    return [
        'attempt' => ['id' => $row['id'], 'examId' => (string)$row['exam_id'], 'title' => $row['title'], 'subject' => $row['subject'], 'questionIds' => array_column($questions, 'id'), 'order' => array_column($questions, 'id'), 'answers' => decode_json($row['answers_json']), 'startedAt' => timestamp_ms($row['started_at']), 'endsAt' => timestamp_ms($row['ends_at']), 'minutes' => (int)$row['duration_minutes']],
        'questions' => $questions
    ];
}

function result_row(array $row): array {
    $total = (int)$row['total_count'];
    $correct = (int)$row['correct_count'];
    return ['id' => (string)$row['id'], 'userId' => (string)$row['user_id'], 'studentName' => $row['full_name'], 'group' => $row['group_name'] ?? '', 'title' => $row['title'], 'subject' => $row['subject'], 'correct' => $correct, 'total' => $total, 'wrong' => $total - $correct, 'percent' => (int)$row['percent'], 'grade' => $row['grade'], 'finishedAt' => timestamp_ms($row['completed_at']), 'expired' => (bool)$row['expired']];
}

function load_state(PDO $pdo, array $user): array {
    $groups = $user['role'] === 'admin'
        ? $pdo->query('SELECT name FROM app_groups ORDER BY name')->fetchAll(PDO::FETCH_COLUMN)
        : ($user['group'] !== '' ? [$user['group']] : []);
    $subjects = $pdo->query('SELECT name FROM app_subjects ORDER BY name')->fetchAll(PDO::FETCH_COLUMN);

    $examSql = 'SELECT e.id,e.title,e.duration_minutes,e.question_count,e.active,s.name AS subject,g.name AS group_name,(SELECT COUNT(*) FROM app_questions q WHERE q.subject_id=e.subject_id) AS available_count FROM app_exams e JOIN app_subjects s ON s.id=e.subject_id LEFT JOIN app_groups g ON g.id=e.group_id';
    if ($user['role'] === 'student') {
        $examStatement = $pdo->prepare(str_replace(' FROM app_exams e', ',EXISTS(SELECT 1 FROM app_results r WHERE r.exam_id=e.id AND r.user_id=:result_user) AS completed FROM app_exams e', $examSql) . ' WHERE e.active=1 AND (e.group_id IS NULL OR e.group_id=(SELECT group_id FROM app_users WHERE id=:user)) ORDER BY e.id DESC');
        $examStatement->execute(['result_user' => $user['id'], 'user' => $user['id']]);
        $examRows = $examStatement->fetchAll();
    } else {
        $examRows = $pdo->query(str_replace(' FROM app_exams e', ',0 AS completed FROM app_exams e', $examSql) . ' ORDER BY e.id DESC')->fetchAll();
    }
    $exams = array_map(static fn(array $row): array => ['id' => (string)$row['id'], 'title' => $row['title'], 'subject' => $row['subject'], 'minutes' => (int)$row['duration_minutes'], 'count' => (int)$row['question_count'], 'availableCount' => (int)$row['available_count'], 'group' => $row['group_name'] ?? '', 'active' => (bool)$row['active'], 'completed' => (bool)$row['completed']], $examRows);

    $questions = [];
    $users = [];
    if ($user['role'] === 'admin') {
        $questionRows = $pdo->query('SELECT q.id,q.question_text,q.options_json,q.correct_option,s.name AS subject FROM app_questions q JOIN app_subjects s ON s.id=q.subject_id ORDER BY q.id DESC')->fetchAll();
        foreach ($questionRows as $row) $questions[] = ['id' => (string)$row['id'], 'subject' => $row['subject'], 'text' => $row['question_text'], 'options' => decode_json($row['options_json']), 'correct' => (int)$row['correct_option']];
        $userRows = $pdo->query('SELECT u.id,u.username,u.full_name,u.role,g.name AS group_name FROM app_users u LEFT JOIN app_groups g ON g.id=u.group_id WHERE u.active=1 ORDER BY u.id')->fetchAll();
        foreach ($userRows as $row) $users[] = ['id' => (string)$row['id'], 'username' => $row['username'], 'name' => $row['full_name'], 'role' => $row['role'], 'group' => $row['group_name'] ?? ''];
    } else {
        $users = [$user];
    }

    $resultSql = 'SELECT r.id,r.user_id,r.correct_count,r.total_count,r.percent,r.grade,r.completed_at,r.expired,u.full_name,g.name AS group_name,e.title,s.name AS subject FROM app_results r JOIN app_users u ON u.id=r.user_id LEFT JOIN app_groups g ON g.id=u.group_id JOIN app_exams e ON e.id=r.exam_id JOIN app_subjects s ON s.id=e.subject_id';
    if ($user['role'] === 'student') {
        $resultStatement = $pdo->prepare($resultSql . ' WHERE r.user_id=:user ORDER BY r.completed_at DESC');
        $resultStatement->execute(['user' => $user['id']]);
        $resultRows = $resultStatement->fetchAll();
    } else {
        $resultRows = $pdo->query($resultSql . ' ORDER BY r.completed_at DESC')->fetchAll();
    }
    $results = array_map('result_row', $resultRows);
    $active = active_attempt($pdo, $user);
    return ['user' => $user, 'csrf' => $_SESSION['csrf'], 'users' => $users, 'groups' => array_values($groups), 'subjects' => array_values($subjects), 'questions' => $questions, 'exams' => $exams, 'results' => $results, 'attempt' => $active['attempt'] ?? null, 'attemptQuestions' => $active['questions'] ?? []];
}

function find_named_id(PDO $pdo, string $table, string $name): ?int {
    if (!in_array($table, ['app_groups', 'app_subjects'], true)) return null;
    $statement = $pdo->prepare("SELECT id FROM $table WHERE name=:name");
    $statement->execute(['name' => $name]);
    $value = $statement->fetchColumn();
    return $value === false ? null : (int)$value;
}

function clean_text($value, int $max): string {
    $text = trim((string)$value);
    if ($text === '' || mb_strlen($text, 'UTF-8') > $max) respond(['error' => 'Маълумоти воридшуда дуруст нест.'], 422);
    return $text;
}

try {
    $pdo = db($config);
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    $body = $method === 'POST' ? input() : [];
    $action = (string)($_GET['action'] ?? $body['action'] ?? 'bootstrap');

    if ($method === 'GET' && $action === 'bootstrap') {
        $_SESSION['csrf'] = $_SESSION['csrf'] ?? bin2hex(random_bytes(32));
        $user = current_user($pdo);
        respond(['data' => $user ? load_state($pdo, $user) : ['user' => null, 'csrf' => $_SESSION['csrf']]]);
    }
    if ($method !== 'POST') respond(['error' => 'Усули дархост дастгирӣ намешавад.'], 405);
    csrf_check();

    if ($action === 'login') {
        $username = trim((string)($body['username'] ?? ''));
        $password = (string)($body['password'] ?? '');
        $statement = $pdo->prepare("SELECT id,password_hash FROM app_users WHERE username=:username AND active=1 AND role IN ('admin','student')");
        $statement->execute(['username' => $username]);
        $row = $statement->fetch();
        if (!$row || !password_verify($password, $row['password_hash'])) respond(['error' => 'Логин ё рамз нодуруст аст.'], 401);
        session_regenerate_id(true);
        $_SESSION['user_id'] = (int)$row['id'];
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
        respond(['data' => load_state($pdo, require_user($pdo))]);
    }

    if ($action === 'logout') {
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $params = session_get_cookie_params();
            setcookie(session_name(), '', ['expires' => time() - 42000, 'path' => $params['path'], 'secure' => $params['secure'], 'httponly' => $params['httponly'], 'samesite' => $params['samesite'] ?? 'Lax']);
        }
        session_destroy();
        respond(['data' => ['loggedOut' => true]]);
    }

    $user = require_user($pdo);
    if ($action === 'create_group') {
        require_admin($user);
        $name = clean_text($body['name'] ?? '', 60);
        if (find_named_id($pdo, 'app_groups', $name)) respond(['error' => 'Ин гурӯҳ аллакай ҳаст.'], 409);
        $statement = $pdo->prepare('INSERT INTO app_groups (name) VALUES (:name)');
        $statement->execute(['name' => $name]);
    } elseif ($action === 'delete_group') {
        require_admin($user);
        $groupId = find_named_id($pdo, 'app_groups', clean_text($body['name'] ?? '', 60));
        if (!$groupId) respond(['error' => 'Гурӯҳ ёфт нашуд.'], 404);
        $check = $pdo->prepare('SELECT (SELECT COUNT(*) FROM app_users WHERE group_id=:user_group)+(SELECT COUNT(*) FROM app_exams WHERE group_id=:exam_group)');
        $check->execute(['user_group' => $groupId, 'exam_group' => $groupId]);
        if ((int)$check->fetchColumn() > 0) respond(['error' => 'Гурӯҳ ба донишҷӯ ё имтиҳон пайваст аст; аввал онро аз он сабтҳо ҷудо кунед.'], 409);
        $statement = $pdo->prepare('DELETE FROM app_groups WHERE id=:id');
        $statement->execute(['id' => $groupId]);
        if (!$statement->rowCount()) respond(['error' => 'Гурӯҳ ёфт нашуд.'], 404);
    } elseif ($action === 'create_subject') {
        require_admin($user);
        $name = clean_text($body['name'] ?? '', 100);
        if (find_named_id($pdo, 'app_subjects', $name)) respond(['error' => 'Ин фан аллакай ҳаст.'], 409);
        $statement = $pdo->prepare('INSERT INTO app_subjects (name) VALUES (:name)');
        $statement->execute(['name' => $name]);
    } elseif ($action === 'delete_subject') {
        require_admin($user);
        $subjectId = find_named_id($pdo, 'app_subjects', clean_text($body['name'] ?? '', 100));
        if (!$subjectId) respond(['error' => 'Фан ёфт нашуд.'], 404);
        $check = $pdo->prepare('SELECT (SELECT COUNT(*) FROM app_questions WHERE subject_id=:question_subject)+(SELECT COUNT(*) FROM app_exams WHERE subject_id=:exam_subject)');
        $check->execute(['question_subject' => $subjectId, 'exam_subject' => $subjectId]);
        if ((int)$check->fetchColumn() > 0) respond(['error' => 'Фан ба савол ё имтиҳон пайваст аст; аввал онҳоро нест кунед.'], 409);
        $statement = $pdo->prepare('DELETE FROM app_subjects WHERE id=:id');
        $statement->execute(['id' => $subjectId]);
        if (!$statement->rowCount()) respond(['error' => 'Фан ёфт нашуд.'], 404);
    } elseif ($action === 'create_student') {
        require_admin($user);
        $username = trim((string)($body['username'] ?? ''));
        $fullName = clean_text($body['name'] ?? '', 160);
        $password = (string)($body['password'] ?? '');
        $groupId = find_named_id($pdo, 'app_groups', clean_text($body['group'] ?? '', 60));
        if (!preg_match('/^[a-zA-Z0-9._-]{3,64}$/', $username) || strlen($password) < 8 || !$groupId) respond(['error' => 'Логин, рамз ё гурӯҳи интихобшуда дуруст нест.'], 422);
        $statement = $pdo->prepare("INSERT INTO app_users (username,password_hash,full_name,role,group_id) VALUES (:username,:hash,:name,'student',:group_id)");
        $statement->execute(['username' => $username, 'hash' => password_hash($password, PASSWORD_DEFAULT), 'name' => $fullName, 'group_id' => $groupId]);
    } elseif ($action === 'delete_student') {
        require_admin($user);
        $studentId = (int)($body['id'] ?? 0);
        $pdo->beginTransaction();
        $studentStatement = $pdo->prepare("SELECT id FROM app_users WHERE id=:id AND role='student' AND active=1 FOR UPDATE");
        $studentStatement->execute(['id' => $studentId]);
        if (!$studentStatement->fetchColumn()) { $pdo->rollBack(); respond(['error' => 'Донишҷӯ ёфт нашуд.'], 404); }
        $attemptCheck = $pdo->prepare("SELECT COUNT(*) FROM app_attempts WHERE user_id=:id AND status='active'");
        $attemptCheck->execute(['id' => $studentId]);
        if ((int)$attemptCheck->fetchColumn() > 0) { $pdo->rollBack(); respond(['error' => 'Донишҷӯ ҳоло имтиҳони фаъол дорад; баъди анҷом ҳисобро нест кунед.'], 409); }
        $disable = $pdo->prepare('UPDATE app_users SET active=0 WHERE id=:id');
        $disable->execute(['id' => $studentId]);
        $pdo->commit();
    } elseif ($action === 'create_question') {
        require_admin($user);
        $subjectId = find_named_id($pdo, 'app_subjects', clean_text($body['subject'] ?? '', 100));
        $questionText = clean_text($body['text'] ?? '', 2000);
        $options = $body['options'] ?? null;
        $correct = filter_var($body['correct'] ?? null, FILTER_VALIDATE_INT);
        if (!$subjectId || !is_array($options) || count($options) !== 4 || $correct === false || $correct < 0 || $correct > 3) respond(['error' => 'Маълумоти савол дуруст нест.'], 422);
        foreach ($options as $option) if (!is_string($option) || trim($option) === '' || mb_strlen($option, 'UTF-8') > 500) respond(['error' => 'Ҳамаи чор ҷавобро пур кунед.'], 422);
        $statement = $pdo->prepare('INSERT INTO app_questions (subject_id,question_text,options_json,correct_option) VALUES (:subject,:question,:options,:correct)');
        $statement->execute(['subject' => $subjectId, 'question' => $questionText, 'options' => json_encode(array_values($options), JSON_UNESCAPED_UNICODE), 'correct' => $correct]);
    } elseif ($action === 'create_exam') {
        require_admin($user);
        $title = clean_text($body['title'] ?? '', 180);
        $subjectId = find_named_id($pdo, 'app_subjects', clean_text($body['subject'] ?? '', 100));
        $groupName = trim((string)($body['group'] ?? ''));
        $groupId = $groupName === '' ? null : find_named_id($pdo, 'app_groups', clean_text($groupName, 60));
        $minutes = filter_var($body['minutes'] ?? null, FILTER_VALIDATE_INT);
        $count = filter_var($body['count'] ?? null, FILTER_VALIDATE_INT);
        if (!$subjectId || ($groupName !== '' && !$groupId) || $minutes === false || $minutes < 1 || $minutes > 240 || $count === false || $count < 1 || $count > 100) respond(['error' => 'Танзимоти имтиҳон дуруст нест.'], 422);
        $countStatement = $pdo->prepare('SELECT COUNT(*) FROM app_questions WHERE subject_id=:subject');
        $countStatement->execute(['subject' => $subjectId]);
        if ((int)$countStatement->fetchColumn() === 0) respond(['error' => 'Барои ин фан аввал савол илова кунед.'], 422);
        $statement = $pdo->prepare('INSERT INTO app_exams (subject_id,group_id,title,duration_minutes,question_count,active,created_by) VALUES (:subject,:group_id,:title,:minutes,:count,1,:creator)');
        $statement->execute(['subject' => $subjectId, 'group_id' => $groupId, 'title' => $title, 'minutes' => $minutes, 'count' => $count, 'creator' => $user['id']]);
    } elseif ($action === 'toggle_exam') {
        require_admin($user);
        $statement = $pdo->prepare('UPDATE app_exams SET active=IF(active=1,0,1) WHERE id=:id');
        $statement->execute(['id' => (int)($body['id'] ?? 0)]);
        if (!$statement->rowCount()) respond(['error' => 'Имтиҳон ёфт нашуд.'], 404);
    } elseif ($action === 'delete_exam') {
        require_admin($user);
        $examId = (int)($body['id'] ?? 0);
        $check = $pdo->prepare('SELECT COUNT(*) FROM app_attempts WHERE exam_id=:id');
        $check->execute(['id' => $examId]);
        if ((int)$check->fetchColumn() > 0) respond(['error' => 'Имтиҳоне, ки аллакай супорида шудааст, нест карда намешавад.'], 409);
        $statement = $pdo->prepare('DELETE FROM app_exams WHERE id=:id');
        $statement->execute(['id' => $examId]);
        if (!$statement->rowCount()) respond(['error' => 'Имтиҳон ёфт нашуд.'], 404);
    } elseif ($action === 'delete_question') {
        require_admin($user);
        $questionId = (int)($body['id'] ?? 0);
        $attemptRows = $pdo->query("SELECT question_ids_json FROM app_attempts WHERE status='active'")->fetchAll(PDO::FETCH_COLUMN);
        foreach ($attemptRows as $attemptIds) if (in_array($questionId, array_map('intval', decode_json($attemptIds)), true)) respond(['error' => 'Саволи имтиҳони ҷорӣ нест карда намешавад.'], 409);
        $statement = $pdo->prepare('DELETE FROM app_questions WHERE id=:id');
        $statement->execute(['id' => $questionId]);
        if (!$statement->rowCount()) respond(['error' => 'Савол ёфт нашуд.'], 404);
    } elseif ($action === 'start_attempt') {
        if ($user['role'] !== 'student') respond(['error' => 'Танҳо донишҷӯ имтиҳон месупорад.'], 403);
        $exam = get_exam($pdo, (int)($body['examId'] ?? 0));
        if (!$exam || !$exam['active'] || ($exam['group'] !== '' && $exam['group'] !== $user['group'])) respond(['error' => 'Ин имтиҳон барои шумо дастрас нест.'], 403);
        $pdo->beginTransaction();
        $lockUser = $pdo->prepare('SELECT id FROM app_users WHERE id=:id AND active=1 FOR UPDATE');
        $lockUser->execute(['id' => $user['id']]);
        if (!$lockUser->fetchColumn()) { $pdo->rollBack(); respond(['error' => 'Ҳисоби донишҷӯ ғайрифаъол аст.'], 403); }
        $existingStatement = $pdo->prepare('SELECT * FROM app_attempts WHERE user_id=:user AND exam_id=:exam FOR UPDATE');
        $existingStatement->execute(['user' => $user['id'], 'exam' => $exam['id']]);
        $existingAttempt = $existingStatement->fetch();
        if ($existingAttempt && $existingAttempt['status'] === 'completed') {
            $pdo->commit();
            respond(['error' => 'Шумо ин имтиҳонро аллакай супоридаед. Такроран супоридан мумкин нест.'], 409);
        }
        if ($existingAttempt && strtotime($existingAttempt['ends_at'] . ' UTC') <= time()) {
            finalize_attempt($pdo, $existingAttempt);
            $pdo->commit();
            respond(['error' => 'Вақти имтиҳон ба охир расидааст. Натиҷа сабт шуд; имтиҳонро такроран супорида намешавад.'], 409);
        }
        if ($existingAttempt) {
            $pdo->commit();
            respond(['data' => load_state($pdo, $user)]);
        }
        $questionStatement = $pdo->prepare('SELECT id FROM app_questions WHERE subject_id=(SELECT subject_id FROM app_exams WHERE id=:exam)');
        $questionStatement->execute(['exam' => $exam['id']]);
        $questionIds = array_map('intval', $questionStatement->fetchAll(PDO::FETCH_COLUMN));
        shuffle($questionIds);
        $questionIds = array_slice($questionIds, 0, min($exam['count'], count($questionIds)));
        if (!$questionIds) { $pdo->rollBack(); respond(['error' => 'Барои ин имтиҳон савол нест.'], 422); }
        $attemptId = bin2hex(random_bytes(16));
        $now = new DateTimeImmutable('now', new DateTimeZone('UTC'));
        $ends = $now->modify('+' . $exam['minutes'] . ' minutes');
        $statement = $pdo->prepare("INSERT INTO app_attempts (id,user_id,exam_id,question_ids_json,answers_json,started_at,ends_at,status) VALUES (:id,:user,:exam,:questions,'{}',:started,:ends,'active')");
        $statement->execute(['id' => $attemptId, 'user' => $user['id'], 'exam' => $exam['id'], 'questions' => json_encode($questionIds), 'started' => $now->format('Y-m-d H:i:s'), 'ends' => $ends->format('Y-m-d H:i:s')]);
        $pdo->commit();
        respond(['data' => load_state($pdo, $user)]);
    } elseif ($action === 'save_answer') {
        if ($user['role'] !== 'student') respond(['error' => 'Ин амал иҷозат нест.'], 403);
        $attemptId = (string)($body['attemptId'] ?? '');
        $questionId = (int)($body['questionId'] ?? 0);
        $answer = filter_var($body['answer'] ?? null, FILTER_VALIDATE_INT);
        $statement = $pdo->prepare("SELECT * FROM app_attempts WHERE id=:id AND user_id=:user AND status='active'");
        $statement->execute(['id' => $attemptId, 'user' => $user['id']]);
        $attempt = $statement->fetch();
        if (!$attempt || strtotime($attempt['ends_at'] . ' UTC') <= time()) respond(['error' => 'Вақти имтиҳон ба охир расидааст.'], 409);
        if ($answer === false || $answer < 0 || $answer > 3 || !in_array($questionId, array_map('intval', decode_json($attempt['question_ids_json'])), true)) respond(['error' => 'Ҷавоби интихобшуда дуруст нест.'], 422);
        $answers = decode_json($attempt['answers_json']);
        $answers[(string)$questionId] = $answer;
        $update = $pdo->prepare('UPDATE app_attempts SET answers_json=:answers WHERE id=:id');
        $update->execute(['answers' => json_encode($answers), 'id' => $attemptId]);
    } elseif ($action === 'submit_attempt') {
        if ($user['role'] !== 'student') respond(['error' => 'Ин амал иҷозат нест.'], 403);
        $attemptId = (string)($body['attemptId'] ?? '');
        $pdo->beginTransaction();
        $statement = $pdo->prepare('SELECT * FROM app_attempts WHERE id=:id AND user_id=:user FOR UPDATE');
        $statement->execute(['id' => $attemptId, 'user' => $user['id']]);
        $attempt = $statement->fetch();
        if (!$attempt) { $pdo->rollBack(); respond(['error' => 'Имтиҳон ёфт нашуд.'], 404); }
        if ($attempt['status'] === 'completed') {
            $pdo->commit();
            $state = load_state($pdo, $user);
            respond(['data' => ['result' => $state['results'][0] ?? null]]);
        }
        finalize_attempt($pdo, $attempt);
        $pdo->commit();
        $state = load_state($pdo, $user);
        respond(['data' => ['result' => $state['results'][0] ?? null]]);
    } else {
        respond(['error' => 'Амалиёт ёфт нашуд.'], 404);
    }

    respond(['data' => load_state($pdo, $user)]);
} catch (Throwable $error) {
    if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) $pdo->rollBack();
    error_log('Exam API error: ' . $error->getMessage());
    respond(['error' => 'Хатои сервер. Маълумоти пайвасти пойгоҳи додаҳоро санҷед.'], 500);
}
