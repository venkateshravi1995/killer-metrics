"use client"

import { DashboardGrid } from "./grid"
import { DashboardHeader } from "./header"
import {
  ConfiguratorDrawer,
  CreateDashboardModal,
  DeleteDashboardModal,
  EditDashboardModal,
} from "./modals"
import { useDashboardBuilderState, type DashboardBuilderInitialData } from "./state"

type DashboardBuilderProps = {
  initialData?: DashboardBuilderInitialData
}

export default function DashboardBuilder({ initialData }: DashboardBuilderProps) {
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
    dashboardStatus,
    dashboardError,
    hasDraft,
    draftStatus,
    draftError,
    refreshIntervalMs,
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
    setIsRenaming,
    setCreateName,
    setCreateDescription,
    setCreateModalOpen,
    setRefreshIntervalMs,
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
    handleDiscardDraft,
    handleDeleteDashboard,
    handleCreateDashboard,
    handleConfigureTile,
    closeConfigurator,
    handleSeriesChange,
  } = useDashboardBuilderState(initialData)

  return (
    <div className="app-shell flex min-h-screen flex-col">
      <DashboardHeader
        dashboards={dashboards}
        activeDashboardId={activeDashboardId}
        dashboardName={dashboardName}
        dashboardStatus={dashboardStatus}
        dashboardError={dashboardError}
        draftStatus={draftStatus}
        draftError={draftError}
        hasDraft={hasDraft}
        refreshIntervalMs={refreshIntervalMs}
        canAddTile={metrics.length > 0}
        onDashboardSelect={handleDashboardSelect}
        onToggleRename={() => setIsRenaming(true)}
        isRenaming={isRenaming}
        onOpenCreateModal={openCreateModal}
        onOpenDeleteModal={openDeleteModal}
        onRefresh={handleRefreshDashboard}
        onRefreshIntervalChange={setRefreshIntervalMs}
        onSaveDashboard={handleSaveDashboard}
        onDiscardDraft={handleDiscardDraft}
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

      <EditDashboardModal
        open={isRenaming}
        name={dashboardName}
        isSaving={dashboardStatus === "saving"}
        onClose={() => setIsRenaming(false)}
        onNameChange={setDashboardName}
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

      <ConfiguratorDrawer
        open={configuratorOpen}
        tile={selectedTile}
        series={selectedSeries}
        metrics={metrics}
        dimensions={dimensions}
        onUpdate={updateTile}
        onClose={closeConfigurator}
      />
    </div>
  )
}
