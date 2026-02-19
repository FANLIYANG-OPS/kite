package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/zxh326/kite/pkg/templates"
)

type GenerateRedisRequest struct {
	Name      string `json:"name" binding:"required"`
	Namespace string `json:"namespace" binding:"required"`
	Password  string `json:"password" binding:"required"`
}

type GenerateRocketMQRequest struct {
	Name      string `json:"name" binding:"required"`
	Namespace string `json:"namespace" binding:"required"`
}

type GenerateHortonworksRequest struct {
	Name      string `json:"name" binding:"required"`
	Namespace string `json:"namespace" binding:"required"`
}

type GenerateElasticsearchRequest struct {
	Name      string `json:"name" binding:"required"`
	Namespace string `json:"namespace" binding:"required"`
}

type GenerateElasticOperatorRequest struct {
	Name      string `json:"name" binding:"required"`
	Namespace string `json:"namespace" binding:"required"`
}

type GenerateDolphinSchedulerRequest struct {
	Name      string `json:"name" binding:"required"`
	Namespace string `json:"namespace" binding:"required"`
}

// GenerateRedis returns generated Redis Sentinel YAML resources
func GenerateRedis(c *gin.Context) {
	var req GenerateRedisRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	yamls, err := templates.RenderRedis(req.Name, req.Namespace, req.Password)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"yamls": yamls})
}

// GenerateHortonworks returns generated Hortonworks Schema Registry YAML resources
func GenerateHortonworks(c *gin.Context) {
	var req GenerateHortonworksRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	yamls, err := templates.RenderHortonworks(req.Name, req.Namespace)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"yamls": yamls})
}

// GenerateElasticsearch returns generated Elasticsearch YAML resources
func GenerateElasticsearch(c *gin.Context) {
	var req GenerateElasticsearchRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	yamls, err := templates.RenderElasticsearch(req.Name, req.Namespace)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"yamls": yamls})
}

// GenerateElasticOperator returns generated Elastic Operator YAML resources (CRDs + operator).
// If a CRD already exists, applying it again will update the CRD.
func GenerateElasticOperator(c *gin.Context) {
	var req GenerateElasticOperatorRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	yamls, err := templates.RenderElasticOperator(req.Name, req.Namespace)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"yamls": yamls})
}

// GenerateDolphinScheduler returns generated DolphinScheduler YAML resources
func GenerateDolphinScheduler(c *gin.Context) {
	var req GenerateDolphinSchedulerRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	yamls, err := templates.RenderDolphinScheduler(req.Name, req.Namespace)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"yamls": yamls})
}

// GenerateRocketMQ returns generated RocketMQ YAML resources
func GenerateRocketMQ(c *gin.Context) {
	var req GenerateRocketMQRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	yamls, err := templates.RenderRocketMQ(req.Name, req.Namespace)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"yamls": yamls})
}
