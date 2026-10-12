import bcrypt from 'bcryptjs';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { SEED_BOOKS } from './books-seed.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const db = new Database(path.join(__dirname, 'data.db'));

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS menu_items (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    volume TEXT NOT NULL,
    price INTEGER NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('hot', 'iced')),
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    mode TEXT NOT NULL,
    total INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'new'
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    item_id TEXT NOT NULL,
    name TEXT NOT NULL,
    volume TEXT NOT NULL,
    price INTEGER NOT NULL,
    qty INTEGER NOT NULL
  );
`);

// ---- Migrations ----
// menu_items originally had CHECK (category IN ('hot','iced')), no photo and
// no description. Rebuild it once so drinks/mojito/food and photos fit.
const menuSql = db.prepare("SELECT sql FROM sqlite_master WHERE name = 'menu_items'").get().sql;
if (menuSql.includes('CHECK')) {
  db.exec(`
    CREATE TABLE menu_items_new (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      volume TEXT NOT NULL DEFAULT '',
      price INTEGER NOT NULL,
      category TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      photo TEXT,
      description TEXT
    );
    INSERT INTO menu_items_new (id, name, volume, price, category, sort_order)
      SELECT id, name, volume, price, category, sort_order FROM menu_items;
    DROP TABLE menu_items;
    ALTER TABLE menu_items_new RENAME TO menu_items;
  `);
}

function addColumn(table, column, def) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`);
}
addColumn('orders', 'table_number', 'TEXT');
addColumn('orders', 'phone', 'TEXT');
addColumn('orders', 'address', 'TEXT');
addColumn('orders', 'comment', 'TEXT');

db.exec(`
  CREATE TABLE IF NOT EXISTS books (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    author TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    price INTEGER NOT NULL,
    photo TEXT,
    in_stock INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS book_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    book_id INTEGER,
    title TEXT NOT NULL,
    price INTEGER NOT NULL,
    qty INTEGER NOT NULL,
    total INTEGER NOT NULL,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    country TEXT NOT NULL,
    city TEXT NOT NULL,
    address TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'new'
  );

  CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    name TEXT NOT NULL,
    rating INTEGER NOT NULL,
    text TEXT NOT NULL DEFAULT '',
    photo TEXT,
    approved INTEGER NOT NULL DEFAULT 0
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    name TEXT NOT NULL,
    phone TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL,
    bonus_balance INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS bonus_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL,
    order_id INTEGER,
    note TEXT NOT NULL DEFAULT ''
  );
`);
addColumn('books', 'category', "TEXT NOT NULL DEFAULT ''");
addColumn('orders', 'customer_id', 'INTEGER');
addColumn('orders', 'bonus_awarded', 'INTEGER NOT NULL DEFAULT 0');

// Seed menu once, from the client's real printed menu (@kaafi_kg, 19 июня post).
const SEED_MENU = [
  { id: 'espresso', name: 'Эспрессо', volume: '30 мл', price: 100, category: 'hot' },
  { id: 'americano-200', name: 'Американо', volume: '200 мл', price: 140, category: 'hot' },
  { id: 'americano-300', name: 'Американо', volume: '300 мл', price: 160, category: 'hot' },
  { id: 'cappuccino-200', name: 'Капучино', volume: '200 мл', price: 150, category: 'hot' },
  { id: 'cappuccino-300', name: 'Капучино', volume: '300 мл', price: 180, category: 'hot' },
  { id: 'latte', name: 'Латте', volume: '300 мл', price: 180, category: 'hot' },
  { id: 'flat-white', name: 'Флэт Уайт', volume: '200 мл', price: 180, category: 'hot' },
  { id: 'raf', name: 'Раф Кофе', volume: '300 мл', price: 220, category: 'hot' },
  { id: 'iced-americano', name: 'Айс Американо', volume: '500 мл', price: 170, category: 'iced' },
  { id: 'iced-latte', name: 'Айс Латте', volume: '500 мл', price: 220, category: 'iced' },
  { id: 'iced-cappuccino', name: 'Айс Капучино', volume: '500 мл', price: 230, category: 'iced' },
  { id: 'iced-raf', name: 'Айс Раф', volume: '500 мл', price: 240, category: 'iced' },
];

const menuCount = db.prepare('SELECT COUNT(*) AS n FROM menu_items').get().n;
if (menuCount === 0) {
  const insert = db.prepare(
    'INSERT INTO menu_items (id, name, volume, price, category, sort_order) VALUES (@id, @name, @volume, @price, @category, @sort_order)',
  );
  const insertAll = db.transaction((items) => {
    items.forEach((item, index) => insert.run({ ...item, sort_order: index }));
  });
  insertAll(SEED_MENU);
}

// Load the client's printed book price list once. A flag in `meta` keeps it
// from coming back if the owner later deletes books on purpose.
db.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
const booksSeeded = db.prepare("SELECT 1 FROM meta WHERE key = 'books_seeded'").get();
if (!booksSeeded) {
  const hasBooks = db.prepare('SELECT COUNT(*) AS n FROM books').get().n > 0;
  if (!hasBooks) {
    const insertBook = db.prepare(
      'INSERT INTO books (title, price, category, sort_order) VALUES (@title, @price, @category, @sort_order)',
    );
    db.transaction(() => {
      SEED_BOOKS.forEach((b, i) => insertBook.run({ ...b, sort_order: i }));
    })();
  }
  db.prepare("INSERT INTO meta (key, value) VALUES ('books_seeded', '1')").run();
}

// Seed a default admin account on first run only. Credentials are printed to
// the server console so the client can log in and change the password.
const adminCount = db.prepare('SELECT COUNT(*) AS n FROM admins').get().n;
if (adminCount === 0) {
  const email = process.env.ADMIN_EMAIL || 'admin@kaafi.kg';
  const password = process.env.ADMIN_PASSWORD || 'kaafi-admin-2026';
  const hash = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO admins (email, password_hash) VALUES (?, ?)').run(email, hash);
  console.log('—————————————————————————————————————————');
  console.log('Создан администратор по умолчанию:');
  console.log(`  Email:    ${email}`);
  console.log(`  Password: ${password}`);
  console.log('Смените пароль после первого входа.');
  console.log('—————————————————————————————————————————');
}
