const express = require("express");
const sqlite3 = require("sqlite3").verbose();

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static("public"));

const db = new sqlite3.Database("./harmonium.db");

db.run("PRAGMA foreign_keys = ON");

// Initialize DB
db.serialize(() => {

  db.run("PRAGMA foreign_keys = ON");

  db.run(`
    CREATE TABLE IF NOT EXISTS powers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE,
      description TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS power_tags (
      power_id INTEGER,
      tag_id INTEGER,
      FOREIGN KEY(power_id) REFERENCES powers(id) ON DELETE CASCADE,
      FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE,
      UNIQUE(power_id, tag_id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS harmonizations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      power_a INTEGER,
      power_b INTEGER,
      result_name TEXT,
      summary TEXT,
      FOREIGN KEY(power_a) REFERENCES powers(id) ON DELETE CASCADE,
      FOREIGN KEY(power_b) REFERENCES powers(id) ON DELETE CASCADE,
      UNIQUE(power_a, power_b)
    )
  `);
});


// --------------------
// GET ALL POWERS (WITH TAGS)
// --------------------
app.get("/api/powers", (req, res) => {
  db.all("SELECT * FROM powers ORDER BY name", [], (err, powers) => {
    if (err) return res.status(500).json(err);

    db.all(`
      SELECT power_tags.power_id, tags.name
      FROM power_tags
      JOIN tags ON power_tags.tag_id = tags.id
    `, [], (err, tagRows) => {

      const tagMap = {};
      tagRows.forEach(row => {
        if (!tagMap[row.power_id]) tagMap[row.power_id] = [];
        tagMap[row.power_id].push(row.name);
      });

      const result = powers.map(p => ({
        ...p,
        tags: tagMap[p.id] || []
      }));

      res.json(result);
    });
  });
});


// --------------------
// GET ALL TAGS
// --------------------
app.get("/api/tags", (req, res) => {
  db.all("SELECT * FROM tags ORDER BY name", [], (err, rows) => {
    res.json(rows);
  });
});


// --------------------
// ADD TAG
// --------------------
app.post("/api/tags", (req, res) => {
  const { name } = req.body;

  db.run(
    "INSERT INTO tags (name) VALUES (?)",
    [name],
    function (err) {
      if (err) return res.status(400).json({ error: err.message });
      res.json({ success: true });
    }
  );
});


// --------------------
// ADD POWER (WITH TAGS)
// --------------------
app.post("/api/powers", (req, res) => {
  const { name, description, tags } = req.body;

  db.run(
    "INSERT INTO powers (name, description) VALUES (?, ?)",
    [name, description],
    function (err) {
      if (err) return res.status(400).json({ error: err.message });

      const powerId = this.lastID;

      if (!tags || tags.length === 0)
        return res.json({ success: true });

      tags.forEach(tagId => {
        db.run(
          "INSERT OR IGNORE INTO power_tags (power_id, tag_id) VALUES (?, ?)",
          [powerId, tagId]
        );
      });

      res.json({ success: true });
    }
  );
});


// --------------------
// ADD HARMONIZATION
// --------------------
app.post("/api/harmonize", (req, res) => {
  let { a, b, result_name, summary } = req.body;

  if (a > b) [a, b] = [b, a];

  db.run(
    "INSERT INTO harmonizations (power_a, power_b, result_name, summary) VALUES (?, ?, ?, ?)",
    [a, b, result_name, summary],
    function (err) {
      if (err) return res.status(400).json({ error: err.message });
      res.json({ success: true });
    }
  );
});


// --------------------
// LOOKUP HARMONIZATION
// --------------------
app.get("/api/harmonize", (req, res) => {
  let { a, b } = req.query;
  a = parseInt(a);
  b = parseInt(b);

  if (a > b) [a, b] = [b, a];

  db.get(
    "SELECT * FROM harmonizations WHERE power_a = ? AND power_b = ?",
    [a, b],
    (err, row) => {
      if (!row) return res.status(404).json({ error: "No combination found" });
      res.json(row);
    }
  );
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

app.get("/debug/powers", (req, res) => {
  db.all("SELECT * FROM powers", [], (err, rows) => {
    res.json(rows);
  });
});

app.get("/debug/harmonizations", (req, res) => {
  db.all("SELECT * FROM harmonizations", [], (err, rows) => {
    res.json(rows);
  });
});

app.delete("/api/tags/:id", (req, res) => {
  const id = req.params.id;

  db.run("DELETE FROM tags WHERE id = ?", [id], function (err) {
    if (err) return res.status(400).json({ error: err.message });
    res.json({ success: true });
  });
});

app.delete("/api/powers/:id", (req, res) => {
  const id = req.params.id;

  db.run("DELETE FROM powers WHERE id = ?", [id], function (err) {
    if (err) return res.status(400).json({ error: err.message });
    res.json({ success: true });
  });
});

app.delete("/api/harmonizations/:id", (req, res) => {
  const id = req.params.id;

  db.run("DELETE FROM harmonizations WHERE id = ?", [id], function (err) {
    if (err) return res.status(400).json({ error: err.message });
    res.json({ success: true });
  });
});

app.get("/api/harmonizations", (req, res) => {
  db.all(`
    SELECT h.id, h.result_name, h.summary, p1.name as power_a_name, p2.name as power_b_name
    FROM harmonizations h
    JOIN powers p1 ON h.power_a = p1.id
    JOIN powers p2 ON h.power_b = p2.id
  `, [], (err, rows) => {
    res.json(rows);
  });
});

// --------------------
// UPDATE POWER TAGS
// --------------------
app.put("/api/powers/:id/tags", (req, res) => {
  const powerId = req.params.id;
  const { tags } = req.body;

  db.serialize(() => {
    // Remove all existing tag links
    db.run("DELETE FROM power_tags WHERE power_id = ?", [powerId]);

    // Add new ones
    if (tags && tags.length > 0) {
      tags.forEach(tagId => {
        db.run(
          "INSERT OR IGNORE INTO power_tags (power_id, tag_id) VALUES (?, ?)",
          [powerId, tagId]
        );
      });
    }

    res.json({ success: true });
  });
});

// --------------------
// UPDATE POWER
// --------------------
app.put("/api/powers/:id", (req, res) => {
  const id = req.params.id;
  const { name, description } = req.body;

  db.run(
    "UPDATE powers SET name = ?, description = ? WHERE id = ?",
    [name, description, id],
    function (err) {
      if (err) return res.status(400).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

// --------------------
// UPDATE HARMONIZATION
// --------------------
app.put("/api/harmonizations/:id", (req, res) => {
  const id = req.params.id;
  const { result_name, summary } = req.body;

  db.run(
    "UPDATE harmonizations SET result_name = ?, summary = ? WHERE id = ?",
    [result_name, summary, id],
    function (err) {
      if (err) return res.status(400).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

// --------------------
// GET MATRIX DATA
// --------------------
app.get("/api/matrix", (req, res) => {
  db.all("SELECT * FROM powers ORDER BY name", [], (err, powers) => {
    if (err) return res.status(500).json(err);

    db.all(`
      SELECT h.id, h.power_a, h.power_b, h.result_name, h.summary,
             p1.name as power_a_name,
             p2.name as power_b_name
      FROM harmonizations h
      JOIN powers p1 ON h.power_a = p1.id
      JOIN powers p2 ON h.power_b = p2.id
    `, [], (err, harmonizations) => {

      const matrix = {};

      harmonizations.forEach(h => {
        const key = `${h.power_a}-${h.power_b}`;
        matrix[key] = h;
      });

      res.json({ powers, matrix });
    });
  });
});