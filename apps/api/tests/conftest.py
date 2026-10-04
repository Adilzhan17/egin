"""Integration tests run in an isolated disposable DB, never against user data."""
import os,subprocess,sys
from uuid import uuid4
from urllib.parse import urlsplit,urlunsplit
import psycopg,pytest
from psycopg import sql

@pytest.fixture(autouse=True)
def isolated_rate_limits(client):
    # A test case owns its request budget. Production limits remain unchanged,
    # and multiple attempts within an individual rate-limit test still accumulate.
    from app.auth import _buckets
    _buckets.clear()
    yield
    _buckets.clear()

@pytest.fixture(scope='session')
def client():
    original=os.environ['DATABASE_URL'];u=urlsplit(original);test_name='egin_test_'+uuid4().hex[:12]
    admin=urlunsplit(u._replace(path='/postgres'));test_url=urlunsplit(u._replace(path='/'+test_name))
    with psycopg.connect(admin,autocommit=True) as c:c.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(test_name)))
    os.environ['DATABASE_URL']=test_url
    try:
        subprocess.run([sys.executable,'-m','app.bootstrap','init'],check=True,env=os.environ)
        from fastapi.testclient import TestClient
        from app.main import app
        from app import db
        assert db.pool.conninfo == test_url, "Refusing to run integration tests outside the disposable database"
        with TestClient(app,base_url='http://localhost:8000') as c:yield c
    finally:
        os.environ['DATABASE_URL']=original
        with psycopg.connect(admin,autocommit=True) as c:c.execute(sql.SQL('DROP DATABASE {} WITH (FORCE)').format(sql.Identifier(test_name)))

@pytest.fixture
def demo(client):
    client.cookies.clear()
    r=client.post('/auth/login',json={'email':'demo@egin.local','password':'EginDemo2026!'})
    assert r.status_code==200
    return client
