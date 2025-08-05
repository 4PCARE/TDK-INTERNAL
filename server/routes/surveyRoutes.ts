
import type { Express } from "express";
import { smartAuth } from "../smartAuth";
import { storage } from "../storage";

export function registerSurveyRoutes(app: Express) {
  // Get surveys
  app.get("/api/surveys", smartAuth, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const surveys = await storage.getSurveys(userId);
      res.json(surveys || []);
    } catch (error) {
      console.error("Error fetching surveys:", error);
      res.status(500).json({ message: "Failed to fetch surveys" });
    }
  });

  // Create survey
  app.post("/api/surveys", smartAuth, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const surveyData = { ...req.body, userId };
      const survey = await storage.createSurvey(surveyData);
      res.json(survey);
    } catch (error) {
      console.error("Error creating survey:", error);
      res.status(500).json({ message: "Failed to create survey" });
    }
  });

  // Submit survey response
  app.post("/api/surveys/:id/responses", async (req: any, res) => {
    try {
      const surveyId = parseInt(req.params.id);
      const responseData = { ...req.body, surveyId };
      const response = await storage.createSurveyResponse(responseData);
      res.json(response);
    } catch (error) {
      console.error("Error submitting survey response:", error);
      res.status(500).json({ message: "Failed to submit survey response" });
    }
  });

  // Get survey responses
  app.get("/api/surveys/:id/responses", smartAuth, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const surveyId = parseInt(req.params.id);
      const responses = await storage.getSurveyResponses(surveyId, userId);
      res.json(responses || []);
    } catch (error) {
      console.error("Error fetching survey responses:", error);
      res.status(500).json({ message: "Failed to fetch survey responses" });
    }
  });
}
