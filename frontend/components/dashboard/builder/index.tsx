"use client"

import { DashboardGrid } from "./grid"
import { DashboardHeader } from "./header"
import {
  ConfiguratorDrawer,
  CreateDashboardModal,
  DeleteDashboardModal,
} from "./modals"
import { useDashboardBuilderState } from "./state"

export default function DashboardBuilder() {
  const {
    tiles,
    selectedTileId,
    editMode,
    metrics,
    dimensions,
    catalogStatus,
    catalogError,
    dashboards,
    activeDashboardId,
    dashboardName,
    dashboardDescription,
    dashboardStatus,
    dashboardError,
    hasDraft,
    draftStatus,
    draftError,
    isRenaming,
    createModalOpen,
    createName,
    createDescription,
    deleteModalOpen,
    deleteTarget,
    configuratorOpen,
    isCompactView,
    metricsByKey,
    dimensionsByKey,
    selectedTile,
    selectedSeries,
    layouts,
    setActiveBreakpoint,
    setSelectedTileId,
    setDashboardName,
    setDashboardDescription,
    setIsRenaming,
    setCreateName,
    setCreateDescription,
    setCreateModalOpen,
    addTile,
    duplicateTile,
    removeTile,
    updateTile,
    commitLayout,
    handleDashboardSelect,
    handleRefreshDashboard,
    openCreateModal,
    openDeleteModal,
    closeDeleteModal,
    handleSaveDashboard,
    handleDeleteDashboard,
    handleCreateDashboard,
    toggleEditMode,
    handleConfigureTile,
    closeConfigurator,
    handleSeriesChange,
  } = useDashboardBuilderState()

  return (
    <div className="app-shell flex min-h-screen flex-col">
      <DashboardHeader
        dashboards={dashboards}
        activeDashboardId={activeDashboardId}
        dashboardName={dashboardName}
        dashboardDescription={dashboardDescription}
        dashboardStatus={dashboardStatus}
        dashboardError={dashboardError}
        draftStatus={draftStatus}
        draftError={draftError}
        hasDraft={hasDraft}
        editMode={editMode}
        isRenaming={isRenaming}
        canAddTile={metrics.length > 0}
        onDashboardSelect={handleDashboardSelect}
        onToggleRename={() => setIsRenaming((prev) => !prev)}
        onRenameDone={() => setIsRenaming(false)}
        onDashboardNameChange={setDashboardName}
        onDashboardDescriptionChange={setDashboardDescription}
        onOpenCreateModal={openCreateModal}
        onOpenDeleteModal={openDeleteModal}
        onRefresh={handleRefreshDashboard}
        onToggleEditMode={toggleEditMode}
        onSaveDashboard={handleSaveDashboard}
        onAddTile={addTile}
      />

      <DashboardGrid
        tiles={tiles}
        layouts={layouts}
        editMode={editMode}
        isCompactView={isCompactView}
        selectedTileId={selectedTileId}
        metricsByKey={metricsByKey}
        dimensionsByKey={dimensionsByKey}
        catalogStatus={catalogStatus}
        catalogError={catalogError}
        onSelectTile={setSelectedTileId}
        onConfigureTile={handleConfigureTile}
        onDuplicateTile={duplicateTile}
        onRemoveTile={removeTile}
        onSeriesChange={handleSeriesChange}
        onLayoutCommit={commitLayout}
        onBreakpointChange={setActiveBreakpoint}
        selectedTile={selectedTile}
        selectedSeries={selectedSeries}
        metrics={metrics}
        dimensions={dimensions}
        onUpdateTile={updateTile}
      />

      <CreateDashboardModal
        open={createModalOpen}
        name={createName}
        description={createDescription}
        isSaving={dashboardStatus === "saving"}
        onClose={() => setCreateModalOpen(false)}
        onNameChange={setCreateName}
        onDescriptionChange={setCreateDescription}
        onCreate={handleCreateDashboard}
      />

      <DeleteDashboardModal
        open={deleteModalOpen}
        target={deleteTarget}
        isBusy={
          dashboardStatus === "loading" ||
          dashboardStatus === "saving" ||
          draftStatus === "saving"
        }
        onClose={closeDeleteModal}
        onDelete={handleDeleteDashboard}
      />

      {editMode && isCompactView ? (
        <ConfiguratorDrawer
          open={configuratorOpen}
          tile={selectedTile}
          series={selectedSeries}
          metrics={metrics}
          dimensions={dimensions}
          onUpdate={updateTile}
          onClose={closeConfigurator}
        />
      ) : null}
    </div>
  )
}
