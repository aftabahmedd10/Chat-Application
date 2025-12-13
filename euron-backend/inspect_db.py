# show_all_tables.py
import sqlite3
from pprint import pprint

DB_PATH = "users.db"

def get_table_names(conn):
    cur = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;"
    )
    return [row[0] for row in cur.fetchall()]

def print_table(conn, table_name):
    cur = conn.execute(f"SELECT * FROM {table_name} LIMIT 0")
    col_names = [d[0] for d in cur.description] if cur.description else []

    print("\n" + "=" * 80)
    print(f"TABLE: {table_name}")
    print("-" * 80)
    print("COLUMNS:", ", ".join(col_names) if col_names else "(no columns)")
    print("-" * 80)

    cur = conn.execute(f"SELECT * FROM {table_name};")
    rows = cur.fetchall()
    if not rows:
        print("(no rows)")
        return

    # print a few rows prettily
    for r in rows:
        # Show values with column names: {col: value, ...}
        if col_names:
            row_dict = dict(zip(col_names, r))
            pprint(row_dict)
        else:
            print(r)

def main():
    conn = sqlite3.connect(DB_PATH)
    try:
        tables = get_table_names(conn)
        if not tables:
            print("No user tables found in the database.")
            return
        for t in tables:
            print_table(conn, t)
    finally:
        conn.close()

if __name__ == "__main__":
    main()
