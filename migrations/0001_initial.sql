PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  uid TEXT PRIMARY KEY,
  nama TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('admin', 'staff')),
  id_karyawan TEXT UNIQUE,
  jabatan TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS karyawan (
  id TEXT PRIMARY KEY,
  uid TEXT UNIQUE,
  id_karyawan TEXT NOT NULL UNIQUE,
  nama TEXT NOT NULL,
  jabatan TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (uid) REFERENCES users(uid) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS absensi (
  id TEXT PRIMARY KEY,
  user_uid TEXT,
  id_karyawan TEXT NOT NULL,
  nama TEXT NOT NULL,
  jabatan TEXT NOT NULL DEFAULT '',
  tanggal TEXT NOT NULL,
  clock_in TEXT,
  clock_out TEXT,
  total_menit INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_absensi_karyawan_tanggal ON absensi(id_karyawan, tanggal);
CREATE INDEX IF NOT EXISTS idx_absensi_tanggal ON absensi(tanggal);

CREATE TABLE IF NOT EXISTS cuti (
  id TEXT PRIMARY KEY,
  user_uid TEXT,
  id_karyawan TEXT NOT NULL,
  nama TEXT NOT NULL,
  jabatan TEXT NOT NULL DEFAULT '',
  jenis_izin TEXT NOT NULL,
  tanggal_mulai TEXT NOT NULL,
  tanggal_selesai TEXT NOT NULL,
  alasan TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Pending',
  catatan TEXT NOT NULL DEFAULT '',
  tgl_pengajuan TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  tgl_review TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_cuti_karyawan ON cuti(id_karyawan);
CREATE INDEX IF NOT EXISTS idx_cuti_status ON cuti(status);

CREATE TABLE IF NOT EXISTS inventaris_stok (
  id TEXT PRIMARY KEY,
  lokasi TEXT NOT NULL,
  nama_barang TEXT NOT NULL,
  jumlah INTEGER NOT NULL DEFAULT 0 CHECK (jumlah >= 0),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(lokasi, nama_barang)
);

CREATE TABLE IF NOT EXISTS inventaris_logs (
  id TEXT PRIMARY KEY,
  waktu TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  user_uid TEXT,
  nama_user TEXT NOT NULL,
  tipe TEXT NOT NULL,
  nama_barang TEXT NOT NULL,
  jumlah INTEGER NOT NULL CHECK (jumlah > 0),
  lokasi TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_inventaris_logs_waktu ON inventaris_logs(waktu DESC);

CREATE TABLE IF NOT EXISTS inv_items (
  id TEXT PRIMARY KEY,
  nama_barang TEXT NOT NULL UNIQUE,
  lokasi TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS penjualan (
  id TEXT PRIMARY KEY,
  user_uid TEXT NOT NULL,
  id_karyawan TEXT NOT NULL DEFAULT '',
  nama TEXT NOT NULL,
  tanggal TEXT NOT NULL,
  items TEXT NOT NULL DEFAULT '[]',
  total_nominal INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_penjualan_user ON penjualan(user_uid);
CREATE INDEX IF NOT EXISTS idx_penjualan_tanggal ON penjualan(tanggal);

CREATE TABLE IF NOT EXISTS laporan_masak (
  id TEXT PRIMARY KEY,
  user_uid TEXT NOT NULL,
  id_karyawan TEXT NOT NULL DEFAULT '',
  nama TEXT NOT NULL,
  tanggal TEXT NOT NULL,
  items TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_laporan_masak_user ON laporan_masak(user_uid);
CREATE INDEX IF NOT EXISTS idx_laporan_masak_tanggal ON laporan_masak(tanggal);

INSERT OR IGNORE INTO users (uid, nama, role, id_karyawan, jabatan)
VALUES ('iYuHHd14h6SWalJC4glHHQ0sfpy2', 'Administrator', 'admin', 'ADM-001', 'Boss');

INSERT OR IGNORE INTO karyawan (id, uid, id_karyawan, nama, jabatan)
VALUES ('admin', 'iYuHHd14h6SWalJC4glHHQ0sfpy2', 'ADM-001', 'Administrator', 'Boss');
