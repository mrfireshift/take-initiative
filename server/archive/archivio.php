<?php
// Take Initiative, archivio degli attori (docs/PIANO_ARCHIVIO_ATTORI.md, lotto A2): the archive server, one script
// without a database. It keeps one JSON file per room in a folder outside the published one, and speaks the protocol
// described in test-support/archiveServerReference.js, whose answers it must give one for one:
// scripts/check-archive-server.mjs tries it. Installation: LEGGIMI.md in this folder.
// No key and no address live here: they are in the configuration file, outside the published folder.
declare(strict_types=1);

// The only line to change in the installed copy: where the configuration file is (see config.esempio.php).
const TI_CONFIG_PATH = '/percorso/fuori/dal/sito/ti-archivio/config.php';

const TI_PROTOCOL = 1;
const TI_SERVICE = 'take-initiative-archivio';
const TI_MIN_KEY_LENGTH = 32;
const TI_MAX_BODY_BYTES = 131072;
const TI_MAX_VALUE_BYTES = 65536;
const TI_MAX_ROOM_RECORDS = 2000;
const TI_TEST_ROOM_PREFIX = 'prova-';
const TI_SECTIONS = ['actor' => ['card', 'vitals', 'state'], 'card-key' => ['card']];
const TI_DEFAULT_ORIGINS = ['https://take-initiative.onrender.com', 'http://localhost:5173'];
const TI_KEY_PLACEHOLDER = 'METTI-QUI-';

function ti_reply(int $status, ?array $body): void
{
    http_response_code($status);
    if ($body !== null) {
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    }
    exit;
}

function ti_refuse(int $status, string $error, array $extra = []): void
{
    ti_reply($status, array_merge(['ok' => false, 'errore' => $error], $extra));
}

// A whole number from 0 up, as JSON gives it; null for anything else (a string, a fraction, a negative).
function ti_integer(mixed $value): ?int
{
    return is_int($value) && $value >= 0 ? $value : null;
}

// The room's file, read under the lock the caller holds. A room never written is an empty one.
function ti_read_room(string $file): array
{
    if (!is_file($file)) {
        return ['seq' => 0, 'records' => []];
    }
    $data = json_decode((string) file_get_contents($file), true, 64);
    if (!is_array($data) || !is_array($data['records'] ?? null)) {
        ti_refuse(500, 'archivio della stanza illeggibile');
    }
    return ['seq' => (int) ($data['seq'] ?? 0), 'records' => $data['records']];
}

// Written whole to a temporary file and renamed over the old one, so a reader never sees half a file.
function ti_write_room(string $file, array $data): void
{
    $encoded = json_encode(
        ['seq' => $data['seq'], 'records' => $data['records'] ?: new stdClass()],
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
    );
    $temp = $file . '.tmp';
    if ($encoded === false || @file_put_contents($temp, $encoded, LOCK_EX) === false || !@rename($temp, $file)) {
        ti_refuse(500, 'archivio della stanza non scritto: manca il permesso di scrittura sulla cartella dei dati');
    }
}

$config = TI_CONFIG_PATH !== '' && @is_file(TI_CONFIG_PATH) ? (@include TI_CONFIG_PATH) : null;
$origins = is_array($config) && is_array($config['origins'] ?? null) ? $config['origins'] : TI_DEFAULT_ORIGINS;

$origin = (string) ($_SERVER['HTTP_ORIGIN'] ?? '');
$allowed = in_array($origin, $origins, true);
header('Cache-Control: no-store');
if ($allowed) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
    header('Access-Control-Allow-Methods: GET, PUT, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, X-TI-Key');
    header('Access-Control-Max-Age: 600');
}

$method = (string) ($_SERVER['REQUEST_METHOD'] ?? 'GET');
if ($method === 'OPTIONS') {
    ti_reply($allowed ? 204 : 403, null);
}
if ($origin !== '' && !$allowed) {
    ti_refuse(403, 'origine non ammessa');
}
if (!is_array($config)) {
    ti_refuse(500, 'configurazione non trovata: controlla TI_CONFIG_PATH e i permessi del file');
}
$key = (string) ($config['key'] ?? '');
if (strlen($key) < TI_MIN_KEY_LENGTH || str_starts_with($key, TI_KEY_PLACEHOLDER)) {
    ti_refuse(500, 'chiave non impostata o troppo corta');
}
if (!hash_equals($key, (string) ($_SERVER['HTTP_X_TI_KEY'] ?? ''))) {
    ti_refuse(401, 'chiave mancante o sbagliata');
}

if ($method === 'GET' && isset($_GET['ping']) && !isset($_GET['room'])) {
    ti_reply(200, ['ok' => true, 'servizio' => TI_SERVICE, 'protocollo' => TI_PROTOCOL]);
}

$room = $_GET['room'] ?? '';
if (!is_string($room) || preg_match('/^[A-Za-z0-9_-]{1,80}$/', $room) !== 1) {
    ti_refuse(400, 'stanza non valida');
}
$dir = rtrim((string) ($config['data_dir'] ?? ''), '/');
if ($dir === '' || !@is_dir($dir) || !@is_writable($dir)) {
    ti_refuse(500, 'cartella dei dati assente o non scrivibile');
}
$file = $dir . '/' . $room . '.json';

// One request at a time on a room: readers share the lock, a writer holds it alone.
$lock = @fopen($dir . '/' . $room . '.lock', 'c');
if ($lock === false || !flock($lock, $method === 'GET' ? LOCK_SH : LOCK_EX)) {
    ti_refuse(500, 'stanza non bloccabile: manca il permesso di scrittura sulla cartella dei dati');
}

if ($method === 'GET') {
    $since = $_GET['since'] ?? '0';
    if (!is_string($since) || preg_match('/^\d{1,15}$/', $since) !== 1) {
        ti_refuse(400, 'since non valido');
    }
    $data = ti_read_room($file);
    $records = array_values(array_filter($data['records'], static fn ($record) => (int) $record['seq'] > (int) $since));
    usort($records, static fn ($left, $right) => $left['seq'] <=> $right['seq']);
    ti_reply(200, ['ok' => true, 'seq' => $data['seq'], 'records' => $records]);
}

if ($method === 'DELETE') {
    if (!str_starts_with($room, TI_TEST_ROOM_PREFIX)) {
        ti_refuse(403, 'si cancella solo una stanza di prova');
    }
    if (is_file($file) && !@unlink($file)) {
        ti_refuse(500, 'stanza di prova non cancellata');
    }
    ti_reply(200, ['ok' => true]);
}

if ($method !== 'PUT') {
    ti_refuse(405, 'metodo non previsto');
}

$raw = file_get_contents('php://input', false, null, 0, TI_MAX_BODY_BYTES + 1);
if ($raw === false || strlen($raw) > TI_MAX_BODY_BYTES) {
    ti_refuse(413, 'richiesta troppo grande');
}
$write = json_decode($raw, true, 16);
if (!is_array($write) || array_is_list($write)) {
    ti_refuse(400, 'il corpo non è JSON');
}
$kind = $write['kind'] ?? null;
$id = $write['id'] ?? null;
$section = $write['section'] ?? null;
$json = $write['json'] ?? null;
// Lengths in bytes, so the script needs no extension: a name is at most 120 characters, an id 1024.
$name = is_string($write['name'] ?? null) && strlen($write['name']) <= 480 ? $write['name'] : '';
$baseRev = ti_integer($write['baseRev'] ?? null);
$at = ti_integer($write['at'] ?? null);
if (!is_string($kind) || !isset(TI_SECTIONS[$kind]) || !is_string($section) || !in_array($section, TI_SECTIONS[$kind], true)) {
    ti_refuse(400, 'tipo o sezione non validi');
}
if (!is_string($id) || $id === '' || strlen($id) > 4096) {
    ti_refuse(400, 'id non valido');
}
if ($baseRev === null || $at === null) {
    ti_refuse(400, 'revisione o data non valide');
}
if (!is_string($json) || strlen($json) > TI_MAX_VALUE_BYTES) {
    ti_refuse(413, 'valore assente o troppo grande');
}
// The value is stored as the text it came as, never rebuilt: only checked to be JSON.
json_decode($json, false, 64);
if (json_last_error() !== JSON_ERROR_NONE) {
    ti_refuse(400, 'il valore non è JSON');
}

$data = ti_read_room($file);
$recordKey = $kind . '|' . $id;
$isNew = !isset($data['records'][$recordKey]);
$record = $isNew ? ['kind' => $kind, 'id' => $id, 'name' => '', 'seq' => 0, 'sections' => []] : $data['records'][$recordKey];
$stored = $record['sections'][$section] ?? null;
$storedRev = is_array($stored) ? (int) $stored['rev'] : 0;
// The same write sent again after an answer that was lost: it is already there.
if (is_array($stored) && $storedRev === $baseRev + 1 && $stored['json'] === $json && (int) $stored['at'] === $at) {
    ti_reply(200, ['ok' => true, 'rev' => $storedRev, 'seq' => (int) $record['seq']]);
}
if ($baseRev !== $storedRev) {
    ti_refuse(409, 'revisione superata', ['section' => $stored, 'seq' => $data['seq']]);
}
if ($isNew && count($data['records']) >= TI_MAX_ROOM_RECORDS) {
    ti_refuse(413, 'stanza piena');
}

$data['seq'] += 1;
$record['sections'][$section] = ['rev' => $storedRev + 1, 'at' => $at, 'json' => $json];
$record['name'] = $name;
$record['seq'] = $data['seq'];
$data['records'][$recordKey] = $record;
ti_write_room($file, $data);
ti_reply(200, ['ok' => true, 'rev' => $storedRev + 1, 'seq' => $data['seq']]);
