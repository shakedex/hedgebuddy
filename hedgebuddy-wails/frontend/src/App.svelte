<script lang="ts">
  import { onMount } from 'svelte';
  import { GetVariables, GetSortedKeys, AddVariable, UpdateVariable, DeleteVariable, OpenStorageFolder, ReloadVariables } from '../wailsjs/go/main/App';
  
  import ListView from './pages/ListView.svelte';
  import VariableForm from './pages/VariableForm.svelte';
  import DeleteConfirm from './pages/DeleteConfirm.svelte';
  import ImportView from './pages/ImportView.svelte';
  import AboutView from './pages/AboutView.svelte';
  import Loader from './components/Loader.svelte';
  import Toast from './components/Toast.svelte';
  import { toast } from './lib/toast';
  import './styles/global.css';
  
  let variables: Record<string, any> = {};
  let sortedKeys: string[] = [];
  let currentView: 'list' | 'form' | 'delete' | 'import' | 'about' = 'list';
  let isLoading = true;
  
  // Form state
  let formName = '';
  let formValue = '';
  let formType = 'string';
  let formDescription = '';
  let formError = '';
  let editingName = '';
  
  // Delete state
  let deleteVarName = '';
  
  onMount(loadVariables);
  
  async function loadVariables() {
    try {
      isLoading = true;
      const startTime = Date.now();
      
      await ReloadVariables(); // Reload from disk first
      variables = await GetVariables();
      sortedKeys = await GetSortedKeys();
      
      // Ensure minimum 800ms loading time for smooth animation
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 800 - elapsed);
      await new Promise(resolve => setTimeout(resolve, remaining));
    } catch (err: any) {
      console.error('Failed to load variables:', err);
    } finally {
      isLoading = false;
    }
  }
  
  function showAddForm() {
    currentView = 'form';
    editingName = '';
    formName = '';
    formValue = '';
    formType = 'string';
    formDescription = '';
    formError = '';
  }
  
  function showEditForm(name: string) {
    currentView = 'form';
    editingName = name;
    const variable = variables[name];
    formName = name;
    formValue = variable.value;
    formType = variable.type;
    formDescription = variable.description;
    formError = '';
  }
  
  function showDeleteConfirm(name: string) {
    deleteVarName = name;
    currentView = 'delete';
  }
  
  function showImportView() {
    currentView = 'import';
  }
  
  function showAboutView() {
    currentView = 'about';
  }
  
  function showListView() {
    currentView = 'list';
  }
  
  async function handleSave(event: CustomEvent) {
    try {
      formError = '';
      const { name, value, type, description } = event.detail;
      
      if (editingName) {
        await UpdateVariable(editingName, name, value, type, description);
        toast.success(`Variable "${name}" updated successfully`);
      } else {
        await AddVariable(name, value, type, description);
        toast.success(`Variable "${name}" added successfully`);
      }
      
      await loadVariables();
      showListView();
    } catch (err: any) {
      formError = err.toString();
      toast.error(`Failed to save: ${err.toString()}`);
    }
  }
  
  async function handleDelete() {
    try {
      await DeleteVariable(deleteVarName);
      toast.success(`Variable "${deleteVarName}" deleted`);
      await loadVariables();
      showListView();
    } catch (err: any) {
      console.error('Failed to delete variable:', err);
      toast.error(`Failed to delete: ${err.toString()}`);
    }
  }
  
  async function handleOpenFolder() {
    try {
      await OpenStorageFolder();
    } catch (err: any) {
      console.error('Failed to open folder:', err);
    }
  }
  
  async function handleImportComplete() {
    await loadVariables();
    showListView();
    toast.success('Variables imported successfully');
  }
</script>

<main class="container">
  {#if currentView === 'list'}
    <ListView 
      {variables}
      {sortedKeys}
      {isLoading}
      on:add={showAddForm}
      on:edit={(e) => showEditForm(e.detail)}
      on:delete={(e) => showDeleteConfirm(e.detail)}
      on:refresh={loadVariables}
      on:openFolder={handleOpenFolder}
      on:import={showImportView}
      on:about={showAboutView}
    />
  {:else if currentView === 'form'}
    <VariableForm
      name={formName}
      value={formValue}
      type={formType}
      description={formDescription}
      errorMsg={formError}
      isEditing={!!editingName}
      on:save={handleSave}
      on:cancel={showListView}
    />
  {:else if currentView === 'delete'}
    <DeleteConfirm
      varName={deleteVarName}
      on:confirm={handleDelete}
      on:cancel={showListView}
    />
  {:else if currentView === 'import'}
    <ImportView
      on:imported={handleImportComplete}
      on:cancel={showListView}
    />
  {:else if currentView === 'about'}
    <AboutView
      on:back={showListView}
    />
  {/if}
</main>

<Toast />

