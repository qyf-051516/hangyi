import { createApp, defineAsyncComponent } from 'vue'
import { createPinia } from 'pinia'
import {
  ElAside,
  ElButton,
  ElCard,
  ElCol,
  ElConfigProvider,
  ElContainer,
  ElDialog,
  ElDrawer,
  ElDropdown,
  ElDropdownItem,
  ElDropdownMenu,
  ElForm,
  ElFormItem,
  ElHeader,
  ElIcon,
  ElInput,
  ElLoading,
  ElMain,
  ElMenu,
  ElMenuItem,
  ElRow,
  ElSubMenu,
  ElTag
} from 'element-plus'
import 'element-plus/dist/index.css'
import './assets/theme.css'
import App from './App.vue'
import AppPageHeader from './components/AppPageHeader.vue'
import AppPageState from './components/AppPageState.vue'
import router from './router'

const app = createApp(App)

app.component('AppPageHeader', AppPageHeader)
app.component('AppPageState', AppPageState)

const elementComponents = {
  ElAside,
  ElButton,
  ElCard,
  ElCol,
  ElConfigProvider,
  ElContainer,
  ElDialog,
  ElDrawer,
  ElDropdown,
  ElDropdownItem,
  ElDropdownMenu,
  ElForm,
  ElFormItem,
  ElHeader,
  ElIcon,
  ElInput,
  ElMain,
  ElMenu,
  ElMenuItem,
  ElRow,
  ElSubMenu,
  ElTag
}

const asyncElementModules = {
  colorPicker: () => import('element-plus/es/components/color-picker/index.mjs'),
  datePicker: () => import('element-plus/es/components/date-picker/index.mjs'),
  empty: () => import('element-plus/es/components/empty/index.mjs'),
  inputNumber: () => import('element-plus/es/components/input-number/index.mjs'),
  pagination: () => import('element-plus/es/components/pagination/index.mjs'),
  radio: () => import('element-plus/es/components/radio/index.mjs'),
  select: () => import('element-plus/es/components/select/index.mjs'),
  switch: () => import('element-plus/es/components/switch/index.mjs'),
  table: () => import('element-plus/es/components/table/index.mjs'),
  tabs: () => import('element-plus/es/components/tabs/index.mjs'),
  timePicker: () => import('element-plus/es/components/time-picker/index.mjs'),
  timeline: () => import('element-plus/es/components/timeline/index.mjs')
}

const asyncElementComponents = {
  ElColorPicker: lazyElementComponent(asyncElementModules.colorPicker, 'ElColorPicker'),
  ElDatePicker: lazyElementComponent(asyncElementModules.datePicker, 'ElDatePicker'),
  ElEmpty: lazyElementComponent(asyncElementModules.empty, 'ElEmpty'),
  ElInputNumber: lazyElementComponent(asyncElementModules.inputNumber, 'ElInputNumber'),
  ElOption: lazyElementComponent(asyncElementModules.select, 'ElOption'),
  ElPagination: lazyElementComponent(asyncElementModules.pagination, 'ElPagination'),
  ElRadio: lazyElementComponent(asyncElementModules.radio, 'ElRadio'),
  ElRadioGroup: lazyElementComponent(asyncElementModules.radio, 'ElRadioGroup'),
  ElSelect: lazyElementComponent(asyncElementModules.select, 'ElSelect'),
  ElSwitch: lazyElementComponent(asyncElementModules.switch, 'ElSwitch'),
  ElTabPane: lazyElementComponent(asyncElementModules.tabs, 'ElTabPane'),
  ElTable: lazyElementComponent(asyncElementModules.table, 'ElTable'),
  ElTableColumn: lazyElementComponent(asyncElementModules.table, 'ElTableColumn'),
  ElTabs: lazyElementComponent(asyncElementModules.tabs, 'ElTabs'),
  ElTimePicker: lazyElementComponent(asyncElementModules.timePicker, 'ElTimePicker'),
  ElTimeline: lazyElementComponent(asyncElementModules.timeline, 'ElTimeline'),
  ElTimelineItem: lazyElementComponent(asyncElementModules.timeline, 'ElTimelineItem')
}

for (const [name, component] of Object.entries(elementComponents)) {
  app.component(name, component)
}

for (const [name, component] of Object.entries(asyncElementComponents)) {
  app.component(name, component)
}

app.directive('loading', ElLoading.directive)
app.use(createPinia())
app.use(router)
app.mount('#app')

function lazyElementComponent(loader, exportName) {
  return defineAsyncComponent(() => {
    return loader().then(module => module[exportName])
  })
}
