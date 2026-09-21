package main

import (
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"sync"
)

var cache = sync.Map{}

type CacheEntry struct {
	Data      []byte
	Timestamp time.Time
}

const CacheTTL = 10 * time.Minute

// Proxy configuration
const (
	OverpassURL = "https://overpass-api.de/api/interpreter"
	Port        = ":8080"
)

func newApp() *fiber.App {
	app := fiber.New(fiber.Config{
		DisableStartupMessage: true,
	})

	app.Use(cors.New(cors.Config{
		AllowOrigins: "https://egin.kz, https://egin.perricheno.ru, http://localhost:3000, http://localhost:3001, capacitor://localhost, http://localhost",
		AllowHeaders: "Origin, Content-Type, Accept",
	}))
	app.Use(logger.New())

	app.Get("/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "ok"})
	})
	app.Get("/api/overpass", handleOverpassQuery)

	return app
}

func main() {
	app := newApp()

	log.Printf("GIS Service running on http://localhost%s", Port)
	log.Fatal(app.Listen(Port))
}

func handleOverpassQuery(c *fiber.Ctx) error {
	s := c.Query("s")
	w := c.Query("w")
	n := c.Query("n")
	e := c.Query("e")

	if s == "" || w == "" || n == "" || e == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Missing bbox parameters (s, w, n, e)",
		})
	}

	cacheKey := fmt.Sprintf("%s-%s-%s-%s", s, w, n, e)
	if val, ok := cache.Load(cacheKey); ok {
		entry := val.(CacheEntry)
		if time.Since(entry.Timestamp) < CacheTTL {
			c.Set("Content-Type", "application/json")
			c.Set("X-Cache", "HIT")
			return c.Send(entry.Data)
		}
		cache.Delete(cacheKey)
	}

	// Build the strict query to extract farmland polygons
	query := fmt.Sprintf(`[out:json][timeout:30];(
      way["landuse"~"farmland|meadow|orchard|vineyard|allotments|grass"](%s,%s,%s,%s);
      relation["landuse"~"farmland|meadow|orchard|vineyard|allotments|grass"](%s,%s,%s,%s);
      way["natural"~"grassland|scrub"](%s,%s,%s,%s);
      way["crop"](%s,%s,%s,%s);
    );out geom;`, s, w, n, e, s, w, n, e, s, w, n, e, s, w, n, e)

	overpassEndpoint := fmt.Sprintf("%s?data=%s", OverpassURL, url.QueryEscape(query))

	// Implement simple retry logic (up to 3 times) for robustness
	var resp *http.Response
	var err error
	client := &http.Client{Timeout: 30 * time.Second}

	for i := 0; i < 3; i++ {
		resp, err = client.Get(overpassEndpoint)
		if err == nil && resp.StatusCode == http.StatusOK {
			break
		}
		if resp != nil {
			resp.Body.Close()
		}
		time.Sleep(time.Duration(i+1) * 2 * time.Second) // backoff
	}

	if err != nil || resp.StatusCode != http.StatusOK {
		log.Printf("Overpass API error: %v, status: %d", err, resp.StatusCode)
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{
			"error": "Overpass API unavailable",
		})
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to read Overpass response",
		})
	}

	// Cache the response
	cache.Store(cacheKey, CacheEntry{
		Data:      bodyBytes,
		Timestamp: time.Now(),
	})

	// Forward raw JSON response
	c.Set("Content-Type", "application/json")
	c.Set("X-Cache", "MISS")
	return c.Send(bodyBytes)
}
