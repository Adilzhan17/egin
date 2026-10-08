import os
from contextlib import contextmanager
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

pool = ConnectionPool(os.environ['DATABASE_URL'], min_size=1, max_size=6, kwargs={'row_factory': dict_row}, open=False)

@contextmanager
def connection():
    with pool.connection() as conn:
        yield conn

def rows(sql, params=()):
    with connection() as conn:
        return conn.execute(sql, params).fetchall()

def one(sql, params=()):
    with connection() as conn:
        return conn.execute(sql, params).fetchone()

def execute(sql, params=()):
    with connection() as conn:
        conn.execute(sql, params)
