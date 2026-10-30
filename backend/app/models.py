from datetime import datetime, timezone
from pydantic import BaseModel, Field, model_validator

class Location(BaseModel):
    latitude: float = Field(ge=-90, le=90, allow_inf_nan=False)
    longitude: float = Field(ge=-180, le=180, allow_inf_nan=False)
    name: str = Field(default='Selected location', max_length=100)

class Mission(Location):
    start: datetime
    end: datetime
    interval_minutes: int = Field(default=60, ge=5, le=1440)
    clearance_deg: float = Field(default=0, ge=0, le=20, allow_inf_nan=False)

    @model_validator(mode='after')
    def dates(self):
        if self.start.tzinfo is None or self.end.tzinfo is None:
            raise ValueError('Dates must include a timezone; use UTC (Z).')
        self.start = self.start.astimezone(timezone.utc)
        self.end = self.end.astimezone(timezone.utc)
        seconds = (self.end - self.start).total_seconds()
        if not 0 < seconds <= 31 * 86400:
            raise ValueError('Mission must span more than zero and at most 31 days.')
        if self.start.year < 1901 or self.end.year > 2052:
            raise ValueError('Supported dates: 1901–2052 (DE421 kernel coverage).')
        if seconds / (60 * self.interval_minutes) > 2000:
            raise ValueError('Maximum 2000 intervals; increase the time interval.')
        return self

class Weights(BaseModel):
    sunlight: float = Field(default=1, ge=0, le=10, allow_inf_nan=False)
    earth: float = Field(default=1, ge=0, le=10, allow_inf_nan=False)
    simultaneous: float = Field(default=2, ge=0, le=10, allow_inf_nan=False)
    @model_validator(mode='after')
    def nonzero(self):
        if self.sunlight + self.earth + self.simultaneous == 0:
            raise ValueError('At least one weight must be positive.')
        return self

class Comparison(BaseModel):
    mission: Mission
    locations: list[Location] = Field(min_length=2, max_length=3)
    weights: Weights = Field(default_factory=Weights)

class ExportRequest(BaseModel):
    mission: Mission
    format: str = Field(default='json', pattern='^(json|csv)$')
