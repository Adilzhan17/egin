package main

import (
	"net/http/httptest"
	"testing"
)

func TestHealth(t *testing.T) {
	resp, err := newApp().Test(httptest.NewRequest("GET", "/health", nil))
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != 200 {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
}

func TestOverpassRequiresAllBBoxParams(t *testing.T) {
	for _, q := range []string{"", "?s=1", "?s=1&w=2", "?s=1&w=2&n=3", "?w=2&n=3&e=4"} {
		resp, err := newApp().Test(httptest.NewRequest("GET", "/api/overpass"+q, nil))
		if err != nil {
			t.Fatal(err)
		}
		if resp.StatusCode != 400 {
			t.Errorf("query %q: expected 400, got %d", q, resp.StatusCode)
		}
	}
}

func TestUnknownRouteIs404(t *testing.T) {
	resp, err := newApp().Test(httptest.NewRequest("GET", "/nope", nil))
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != 404 {
		t.Fatalf("expected 404, got %d", resp.StatusCode)
	}
}

func TestCORSAllowsKnownOriginOnly(t *testing.T) {
	for origin, want := range map[string]bool{
		"https://egin.perricheno.ru": true,
		"https://evil.example":       false,
	} {
		req := httptest.NewRequest("GET", "/health", nil)
		req.Header.Set("Origin", origin)
		resp, err := newApp().Test(req)
		if err != nil {
			t.Fatal(err)
		}
		got := resp.Header.Get("Access-Control-Allow-Origin") == origin
		if got != want {
			t.Errorf("origin %s: allowed=%v, want %v", origin, got, want)
		}
	}
}
