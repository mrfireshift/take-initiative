<?php
// Take Initiative, archivio degli attori: the configuration of the archive server, as an example.
// Copy it OUTSIDE the folder the web server publishes, name it config.php, and write its path in TI_CONFIG_PATH at the
// top of the installed archivio.php. The real file holds the key: it never goes into the repository.
return [
    // At least 32 characters, random. The same key goes into the plugin's Options on each of the GM's computers.
    'key' => 'METTI-QUI-UNA-CHIAVE-LUNGA-E-CASUALE',
    // Where the rooms' files are written: a folder outside the published one, writable by the web server's user.
    'data_dir' => '/percorso/fuori/dal/sito/ti-archivio/dati',
    // Who may call from a browser: the plugin in production and the local build.
    'origins' => ['https://take-initiative.onrender.com', 'http://localhost:5173'],
];
