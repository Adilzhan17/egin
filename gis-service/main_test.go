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
