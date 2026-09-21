package main

import (
	"errors"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/limiter"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/fiber/v2/middleware/recover"
)

// Proxy configuration. Variables (not constants) so tests can point them at a fake upstream.
var (
	overpassURL   = "https://overpass-api.de/api/interpreter"
	retryDelay    = 2 * time.Second
	upstreamTries = 3
)

const (
	Port = ":8080"

	CacheTTL        = 10 * time.Minute
	CacheMaxEntries = 256
	MaxBodyBytes    = 64 << 20 // upstream response cap
	MaxBBoxDegrees  = 1.0      // max bbox side, roughly 110 km
	RequestsPerMin  = 60
)

type bbox struct{ S, W, N, E float64 }

// parseBBox validates the raw query values. Everything reaching the Overpass query is a
// formatted float64, so user input can never inject Overpass QL.
func parseBBox(s, w, n, e string) (bbox, error) {
	parse := func(name, raw string, limit float64) (float64, error) {
		v, err := strconv.ParseFloat(strings.TrimSpace(raw), 64)
		if err != nil || math.IsNaN(v) || math.IsInf(v, 0) {
			return 0, fmt.Errorf("%s must be a number", name)
		}
		if v < -limit || v > limit {
			return 0, fmt.Errorf("%s is out of range", name)
		}
		return v, nil
	}

	var b bbox
	var err error
	if b.S, err = parse("s", s, 90); err != nil {
		return b, err
	}
	if b.N, err = parse("n", n, 90); err != nil {
		return b, err
	}
	if b.W, err = parse("w", w, 180); err != nil {
		return b, err
	}
	if b.E, err = parse("e", e, 180); err != nil {
		return b, err
	}
	if b.S >= b.N || b.W >= b.E {
		return b, errors.New("bbox must satisfy s < n and w < e")
	}
	if b.N-b.S > MaxBBoxDegrees || b.E-b.W > MaxBBoxDegrees {
		return b, fmt.Errorf("bbox is too large (max %.0f degrees per side)", MaxBBoxDegrees)
	}
	return b, nil
}

func (b bbox) key() string {
	return fmt.Sprintf("%.5f,%.5f,%.5f,%.5f", b.S, b.W, b.N, b.E)
}

// ---- bounded TTL cache -------------------------------------------------------------------

type cacheEntry struct {
	data []byte
	at   time.Time
}

type boundedCache struct {
	mu  sync.Mutex
	max int
	ttl time.Duration
	m   map[string]cacheEntry
}

func newBoundedCache(max int, ttl time.Duration) *boundedCache {
	return &boundedCache{max: max, ttl: ttl, m: make(map[string]cacheEntry)}
}

func (c *boundedCache) get(key string) ([]byte, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	e, ok := c.m[key]
	if !ok {
		return nil, false
	}
	if time.Since(e.at) >= c.ttl {
		delete(c.m, key)
		return nil, false
	}
	return e.data, true
}

func (c *boundedCache) set(key string, data []byte) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if _, exists := c.m[key]; !exists && len(c.m) >= c.max {
		c.evictLocked()
	}
	c.m[key] = cacheEntry{data: data, at: time.Now()}
}

// evictLocked drops expired entries, then the oldest one if the cache is still full.
func (c *boundedCache) evictLocked() {
	var oldestKey string
	var oldest time.Time
	for k, e := range c.m {
		if time.Since(e.at) >= c.ttl {
			delete(c.m, k)
			continue
		}
		if oldestKey == "" || e.at.Before(oldest) {
			oldestKey, oldest = k, e.at
		}
	}
	if len(c.m) >= c.max && oldestKey != "" {
		delete(c.m, oldestKey)
	}
}

func (c *boundedCache) size() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return len(c.m)
}

var cache = newBoundedCache(CacheMaxEntries, CacheTTL)

// ---- app ---------------------------------------------------------------------------------

func clientIP(c *fiber.Ctx) string {
	if ip := c.Get("CF-Connecting-IP"); ip != "" {
		return ip
	}
	return c.IP()
}

func newApp() *fiber.App {
	app := fiber.New(fiber.Config{
		DisableStartupMessage: true,
		ReadTimeout:           15 * time.Second,
		WriteTimeout:          60 * time.Second,
	})

	app.Use(recover.New())
	app.Use(cors.New(cors.Config{
		AllowOrigins: "https://egin.kz, https://egin.perricheno.ru, https://egin.perricheno.com, http://localhost:3000, http://localhost:3001, capacitor://localhost, http://localhost",
		AllowHeaders: "Origin, Content-Type, Accept",
	}))
	app.Use(logger.New())

	// Health checks are registered before the limiter so monitors are never throttled.
	app.Get("/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "ok"})
	})

	app.Use(limiter.New(limiter.Config{
		Max:          RequestsPerMin,
		Expiration:   time.Minute,
		KeyGenerator: clientIP,
		LimitReached: func(c *fiber.Ctx) error {
			return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{"error": "Too many requests"})
		},
	}))

	app.Get("/api/overpass", handleOverpassQuery)
	return app
}

func main() {
	app := newApp()

	log.Printf("GIS Service running on http://localhost%s", Port)
	log.Fatal(app.Listen(Port))
}

func buildQuery(b bbox) string {
	box := fmt.Sprintf("(%f,%f,%f,%f)", b.S, b.W, b.N, b.E)
	return `[out:json][timeout:30];(
      way["landuse"~"farmland|meadow|orchard|vineyard|allotments|grass"]` + box + `;
      relation["landuse"~"farmland|meadow|orchard|vineyard|allotments|grass"]` + box + `;
      way["natural"~"grassland|scrub"]` + box + `;
      way["crop"]` + box + `;
    );out geom;`
}

// fetchOverpass asks the upstream with retries. It never dereferences a nil response.
func fetchOverpass(query string) ([]byte, error) {
	endpoint := fmt.Sprintf("%s?data=%s", overpassURL, url.QueryEscape(query))
	client := &http.Client{Timeout: 30 * time.Second}

	var lastErr error
	for i := 0; i < upstreamTries; i++ {
		if i > 0 {
			time.Sleep(time.Duration(i) * retryDelay)
		}

		resp, err := client.Get(endpoint)
		if err != nil {
			lastErr = err
			continue
		}
		body, readErr := io.ReadAll(io.LimitReader(resp.Body, MaxBodyBytes+1))
		resp.Body.Close()

		switch {
		case resp.StatusCode != http.StatusOK:
			lastErr = fmt.Errorf("upstream status %d", resp.StatusCode)
		case readErr != nil:
			lastErr = readErr
		case len(body) > MaxBodyBytes:
			return nil, errors.New("upstream response too large")
		default:
			return body, nil
		}
	}
	return nil, lastErr
}

func handleOverpassQuery(c *fiber.Ctx) error {
	s, w, n, e := c.Query("s"), c.Query("w"), c.Query("n"), c.Query("e")
	if s == "" || w == "" || n == "" || e == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Missing bbox parameters (s, w, n, e)",
		})
	}

	b, err := parseBBox(s, w, n, e)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	key := b.key()
	if data, ok := cache.get(key); ok {
		c.Set("Content-Type", "application/json")
		c.Set("X-Cache", "HIT")
		return c.Send(data)
	}

	body, err := fetchOverpass(buildQuery(b))
	if err != nil {
		log.Printf("Overpass API error: %v", err)
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{
			"error": "Overpass API unavailable",
		})
	}

	cache.set(key, body)
	c.Set("Content-Type", "application/json")
	c.Set("X-Cache", "MISS")
	return c.Send(body)
}
