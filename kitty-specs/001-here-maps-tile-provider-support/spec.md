# Feature Specification: HERE Maps Tile Provider Support

**Feature Branch**: `001-here-maps-tile-provider-support`
**Created**: 2026-02-20
**Status**: Draft
**Input**: User description: "Add HERE maps as a tile provider option for leaflet-geokit web component, with configuration and testing in dev harness"

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Select HERE Maps Provider (Priority: P1)

A developer using the dev harness wants to visualize map data using HERE maps instead of the default OpenStreetMap tiles. They navigate to the dev harness, select "HERE" from the provider dropdown, and the map refreshes to display HERE map tiles.

**Why this priority**: This is the core functionality that enables the entire feature. Without provider selection, no other HERE maps capabilities are accessible. This represents the minimum viable implementation that delivers immediate value.

**Independent Test**: Can be fully tested by selecting HERE from the provider dropdown in the dev harness and verifying that HERE map tiles load successfully. Delivers immediate value by enabling access to HERE's mapping service.

**Acceptance Scenarios**:

1. **Given** the dev harness is loaded with OSM as the default provider, **When** the developer selects "HERE" from the provider dropdown, **Then** the map refreshes and displays HERE map tiles using the default `lite.day` style
2. **Given** a valid HERE API key has been configured, **When** the developer selects HERE as the provider, **Then** the map loads successfully without errors
3. **Given** the developer has selected HERE as the provider, **When** they refresh the dev harness, **Then** the HERE provider selection persists and the map loads with HERE tiles

---

### User Story 2 - Configure HERE Map Style (Priority: P2)

A developer wants to test different visual representations of the map by switching between HERE's available styles. With HERE selected as the provider, they choose between `lite.day`, `normal.day`, and `satellite.day` styles from a style dropdown, and the map updates to reflect the selected style.

**Why this priority**: Style selection enhances the core provider functionality and enables developers to test different visual presentations. However, a default style (`lite.day`) is sufficient for basic functionality, making this enhancement rather than core.

**Independent Test**: Can be tested independently by selecting HERE as provider and then changing styles via the style dropdown. Each style change should result in visually distinct map tiles. Delivers value by enabling visual testing across different map presentations.

**Acceptance Scenarios**:

1. **Given** HERE is selected as the provider, **When** the developer selects `normal.day` from the style dropdown, **Then** the map refreshes with the normal.day style tiles
2. **Given** HERE is selected as the provider, **When** the developer selects `satellite.day` from the style dropdown, **Then** the map displays satellite imagery
3. **Given** a specific HERE style is selected, **When** the developer refreshes the dev harness, **Then** the selected style persists and loads automatically

---

### User Story 3 - Handle Missing or Invalid API Key (Priority: P3)

A developer attempts to use HERE maps but either hasn't configured an API key or has provided an invalid key. The system detects this condition, displays a clear error message via toast notification, automatically falls back to OSM tiles, and disables the HERE provider option to prevent repeated failures.

**Why this priority**: Error handling is important for user experience but not required for core functionality. With a valid API key, this scenario never occurs. This is defensive programming that improves robustness.

**Independent Test**: Can be tested by removing or corrupting the configured HERE API key and attempting to select HERE as provider. System should gracefully degrade without breaking the dev harness. Delivers value by ensuring the harness remains usable even with misconfiguration.

**Acceptance Scenarios**:

1. **Given** no HERE API key has been configured, **When** the developer selects HERE from the provider dropdown, **Then** an error toast is displayed, the map falls back to OSM, and the HERE option is disabled
2. **Given** an invalid HERE API key is configured, **When** HERE tiles fail to load, **Then** an error toast explains the failure, the map switches to OSM, and the HERE option is disabled
3. **Given** the HERE option has been disabled due to key failure, **When** the developer configures a valid API key and refreshes the harness, **Then** the HERE option becomes available again

---

### Edge Cases

- What happens when the network request to HERE tile servers times out or fails?
- How does the system handle rapid provider switching (OSM → HERE → OSM) before tiles fully load?
- What happens if the API key is valid but the rate limit is exceeded?
- How does the system behave if persistent storage is unavailable or disabled?
- What happens when switching providers while the map is actively being panned or zoomed?

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: Web component MUST accept a tile provider configuration property that supports "osm" and "here" as valid values
- **FR-002**: Web component MUST accept a style configuration property for HERE maps that supports "lite.day", "normal.day", and "satellite.day" values
- **FR-003**: Dev harness MUST provide a provider selection dropdown with options for "OSM" and "HERE"
- **FR-004**: Dev harness MUST provide a style selection dropdown visible only when HERE is selected as the provider
- **FR-005**: Dev harness MUST store the HERE API key persistently so it's available across sessions
- **FR-006**: Dev harness MUST persist provider and style selections across page refreshes
- **FR-007**: System MUST use `lite.day` as the default style when HERE provider is selected without explicit style specification
- **FR-008**: System MUST authenticate requests to HERE tile servers using the stored API key
- **FR-009**: System MUST display an error toast notification when HERE API key is missing or invalid
- **FR-010**: System MUST automatically fallback to OSM provider when HERE tile loading fails
- **FR-011**: System MUST disable the HERE provider option in the dropdown when API key is unavailable or invalid
- **FR-012**: System MUST re-enable the HERE provider option when a valid API key becomes available in local storage
- **FR-013**: Web component MUST dynamically switch tile layers when provider or style properties change

### Key Entities

- **Tile Provider Configuration**: Represents the selected mapping service and its parameters
  - Provider type: "osm" or "here"
  - API key (for HERE only)
  - Style selection (for HERE: "lite.day", "normal.day", "satellite.day")
  - Active status (enabled/disabled based on API key validity)

- **Map Display State**: The current visualization state
  - Active provider: which tile service is currently rendering
  - Active style: the visual theme being displayed
  - View position: zoom level and center coordinates (preserved across provider switches)

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Developers can successfully switch between OSM and HERE maps in the dev harness with provider selection persisting across sessions
- **SC-002**: Map tiles load successfully from HERE within 2 seconds when a valid API key is provided and network conditions are normal
- **SC-003**: System gracefully handles invalid or missing API keys by displaying an error message and falling back to OSM without breaking the dev harness functionality
- **SC-004**: All three HERE map styles (lite.day, normal.day, satellite.day) render correctly and visually distinct in the dev harness
- **SC-005**: Provider and style changes update the map display without requiring page refresh or manual map reinitialization

## Assumptions and Dependencies

### Assumptions

- Developers using the dev harness have access to a valid HERE API key (obtainable from HERE developer portal)
- The dev harness is used in modern browsers that support persistent storage mechanisms
- Network connectivity is available to reach HERE tile servers
- Default style (`lite.day`) is suitable for most development and testing scenarios

### Dependencies

- **Existing Dev Harness**: The leaflet-geokit dev harness already exists and is functional with OSM provider
- **Web Component**: The leaflet-geokit web component is already implemented and supports configurable tile providers
- **HERE API Account**: Users must create a HERE developer account to obtain an API key (external dependency)
- **Browser Compatibility**: Feature requires browser support for web components and persistent storage
