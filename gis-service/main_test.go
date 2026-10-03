package main

import (
	"fmt"
	"github.com/gofiber/fiber/v2"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func get(t *testing.T, path string, headers ...string) *http.Response {
	t.Helper()
	req := httptest.NewRequest("GET", path, nil)
	for i := 0; i+1 < len(headers); i += 2 {
		req.Header.Set(headers[i], headers[i+1])
	}
	resp, err := newApp().Test(req, -1)
	if err != nil {
		t.Fatal(err)
	}
	return resp
}

func bodyOf(t *testing.T, r *http.Response) string {
	t.Helper()
	b, _ := io.ReadAll(r.Body)
	return string(b)
}

// fakeUpstream replaces Overpass; it counts calls and returns the given status/body.
func fakeUpstream(t *testing.T, status int, body string) *int32 {
	t.Helper()
	var calls int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&calls, 1)
		w.WriteHeader(status)
		_, _ = w.Write([]byte(body))
	}))
	oldURL, oldDelay := overpassURL, retryDelay
	overpassURL, retryDelay = srv.URL, 0
	cache = newBoundedCache(CacheMaxEntries, CacheTTL)
	t.Cleanup(func() { srv.Close(); overpassURL, retryDelay = oldURL, oldDelay })
	return &calls
}

const validBBox = "?s=43.20&w=76.90&n=43.30&e=77.00"

func TestHealth(t *testing.T) {
	resp := get(t, "/health")
	if resp.StatusCode != 200 {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	if !strings.Contains(bodyOf(t, resp), `"status":"ok"`) {
		t.Fatal("unexpected health body")
	}
}

func TestOverpassRequiresAllBBoxParams(t *testing.T) {
	for _, q := range []string{"", "?s=1", "?s=1&w=2", "?s=1&w=2&n=3", "?w=2&n=3&e=4"} {
		if resp := get(t, "/api/overpass"+q); resp.StatusCode != 400 {
			t.Errorf("query %q: expected 400, got %d", q, resp.StatusCode)
		}
	}
}

// SEC-12: user input must never reach the Overpass query as text.
func TestOverpassRejectsInjectionAndBadBBoxes(t *testing.T) {
	calls := fakeUpstream(t, 200, `{}`)
	bad := map[string]string{
		"injection in s":   "?s=1);out;(node(1&w=2&n=3&e=4",
		"injection in e":   "?s=1&w=2&n=3&e=4);way[x](0,0,1,1",
		"letters":          "?s=a&w=b&n=c&e=d",
		"NaN":              "?s=NaN&w=1&n=2&e=2",
		"Inf":              "?s=-Inf&w=1&n=2&e=2",
		"lat out of range": "?s=80&w=1&n=95&e=2",
		"lon out of range": "?s=1&w=1&n=1.5&e=181",
		"inverted lat":     "?s=44&w=76&n=43&e=77",
		"inverted lon":     "?s=43&w=77&n=44&e=76",
		"zero area":        "?s=43&w=76&n=43&e=77",
		"world sized":      "?s=-90&w=-180&n=90&e=180",
		"too tall":         "?s=40&w=76&n=42&e=76.5",
		"too wide":         "?s=40&w=76&n=40.5&e=78",
	}
	for name, q := range bad {
		if resp := get(t, "/api/overpass"+q); resp.StatusCode != 400 {
			t.Errorf("%s (%s): expected 400, got %d", name, q, resp.StatusCode)
		}
	}
	if atomic.LoadInt32(calls) != 0 {
		t.Fatalf("invalid requests must never reach the upstream, got %d calls", *calls)
	}
}

func TestBuildQueryContainsOnlyNumbers(t *testing.T) {
	b, err := parseBBox("43.2", "76.9", "43.3", "77.0")
	if err != nil {
		t.Fatal(err)
	}
	q := buildQuery(b)
	if strings.Count(q, "(43.200000,76.900000,43.300000,77.000000)") != 4 {
		t.Fatalf("bbox not rendered as formatted floats:\n%s", q)
	}
}

func TestOverpassProxiesAndCaches(t *testing.T) {
	calls := fakeUpstream(t, 200, `{"elements":[]}`)

	first := get(t, "/api/overpass"+validBBox)
	if first.StatusCode != 200 || first.Header.Get("X-Cache") != "MISS" {
		t.Fatalf("first: status=%d cache=%s", first.StatusCode, first.Header.Get("X-Cache"))
	}
	if bodyOf(t, first) != `{"elements":[]}` {
		t.Fatal("body was not forwarded verbatim")
	}
	second := get(t, "/api/overpass"+validBBox)
	if second.Header.Get("X-Cache") != "HIT" {
		t.Fatalf("second request should be a cache HIT, got %q", second.Header.Get("X-Cache"))
	}
	// same box written differently must hit the same cache entry
	third := get(t, "/api/overpass?s=43.2&w=76.9&n=43.3&e=77")
	if third.Header.Get("X-Cache") != "HIT" {
		t.Fatalf("canonicalised key should hit, got %q", third.Header.Get("X-Cache"))
	}
	if n := atomic.LoadInt32(calls); n != 1 {
		t.Fatalf("expected exactly 1 upstream call, got %d", n)
	}
}

// BUG-03: a dead or failing upstream used to nil-dereference and take the process down.
func TestOverpassUpstreamFailureIs503NotPanic(t *testing.T) {
	calls := fakeUpstream(t, 500, `boom`)
	resp := get(t, "/api/overpass"+validBBox)
	if resp.StatusCode != 503 {
		t.Fatalf("expected 503, got %d", resp.StatusCode)
	}
	if n := atomic.LoadInt32(calls); n != int32(upstreamTries) {
		t.Fatalf("expected %d retries, got %d", upstreamTries, n)
	}
}

func TestOverpassUnreachableUpstreamIs503(t *testing.T) {
	oldURL, oldDelay := overpassURL, retryDelay
	overpassURL, retryDelay = "http://127.0.0.1:1", 0 // nothing listens here
	cache = newBoundedCache(CacheMaxEntries, CacheTTL)
	defer func() { overpassURL, retryDelay = oldURL, oldDelay }()

	if resp := get(t, "/api/overpass"+validBBox); resp.StatusCode != 503 {
		t.Fatalf("expected 503 for a connection error (used to panic), got %d", resp.StatusCode)
	}
}

func TestFailedResponsesAreNotCached(t *testing.T) {
	fakeUpstream(t, 500, `boom`)
	get(t, "/api/overpass"+validBBox)
	if cache.size() != 0 {
		t.Fatal("failed upstream responses must not be cached")
	}
}

func TestCacheIsBounded(t *testing.T) {
	c := newBoundedCache(3, time.Minute)
	for i := 0; i < 50; i++ {
		c.set(fmt.Sprint(i), []byte("x"))
		if c.size() > 3 {
			t.Fatalf("cache grew to %d entries", c.size())
		}
	}
}

func TestCacheExpires(t *testing.T) {
	c := newBoundedCache(3, 10*time.Millisecond)
	c.set("k", []byte("v"))
	if _, ok := c.get("k"); !ok {
		t.Fatal("expected a hit")
	}
	time.Sleep(20 * time.Millisecond)
	if _, ok := c.get("k"); ok {
		t.Fatal("expected the entry to expire")
	}
}

func TestPanicsAreRecovered(t *testing.T) {
	app := newApp()
	app.Get("/boom", func(c *fiber.Ctx) error { panic("kaboom") })
	resp, err := app.Test(httptest.NewRequest("GET", "/boom", nil), -1)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != 500 {
		t.Fatalf("expected 500 from recover middleware, got %d", resp.StatusCode)
	}
}

func TestRateLimitPerClient(t *testing.T) {
	fakeUpstream(t, 200, `{}`)
	app := newApp()
	do := func(ip string) int {
		req := httptest.NewRequest("GET", "/api/overpass"+validBBox, nil)
		req.Header.Set("CF-Connecting-IP", ip)
		resp, err := app.Test(req, -1)
		if err != nil {
			t.Fatal(err)
		}
		return resp.StatusCode
	}
	for i := 0; i < RequestsPerMin; i++ {
		if code := do("9.9.9.9"); code != 200 {
			t.Fatalf("request %d: expected 200, got %d", i, code)
		}
	}
	if code := do("9.9.9.9"); code != 429 {
		t.Fatalf("expected 429 once the budget is used, got %d", code)
	}
	if code := do("8.8.8.8"); code != 200 {
		t.Fatalf("another client must not be limited, got %d", code)
	}
}

func TestHealthIsNeverRateLimited(t *testing.T) {
	app := newApp()
	for i := 0; i < RequestsPerMin*2; i++ {
		resp, err := app.Test(httptest.NewRequest("GET", "/health", nil), -1)
		if err != nil || resp.StatusCode != 200 {
			t.Fatalf("health check %d failed: %v %v", i, err, resp)
		}
	}
}

func TestUnknownRouteIs404(t *testing.T) {
	if resp := get(t, "/nope"); resp.StatusCode != 404 {
		t.Fatalf("expected 404, got %d", resp.StatusCode)
	}
}

func TestCORSAllowsKnownOriginsOnly(t *testing.T) {
	for origin, want := range map[string]bool{
		"https://egin.perricheno.ru":  true,
		"https://egin.perricheno.com": true,
		"https://evil.example":        false,
	} {
		resp := get(t, "/health", "Origin", origin)
		if got := resp.Header.Get("Access-Control-Allow-Origin") == origin; got != want {
			t.Errorf("origin %s: allowed=%v, want %v", origin, got, want)
		}
	}
}
