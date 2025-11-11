<template>
  <div>
    <SearchInput placeholder="Enter your bank" input="" @output="setSearch"/>
    <div class="provider-list">
    <div @click="selectOption(option)" :class="providerContainer(option)" v-for="option in filterredOptions">

      <img :src="option.logo" class="provider-logo" />
      <div class="provider-description">
        {{ option.description }}
      </div>
    </div>
  </div>
  </div>
</template>



<script>
import SearchInput from '../components/SearchInput.vue'
import ModelBank from '../assets/bank-logos/Model.png';
import ADCB from '../assets/bank-logos/ADCB.png';
import ADIB from '../assets/bank-logos/ADIB.png';
import CBD from '../assets/bank-logos/CBD.png';
import DIB from '../assets/bank-logos/DIB.png';
import ENBD from '../assets/bank-logos/ENBD.png';
import FAB from '../assets/bank-logos/FAB.png';
import HSBC from '../assets/bank-logos/HSBC.png';
import Mashreq from '../assets/bank-logos/Mashreq.png';

export default {
  components: {
    SearchInput,
  },
  data() {
    return {
      search: '',
      options: [
        {logo: ModelBank, description: 'Model Bank', id: 'model_bank', active: true},
        {logo: ADCB, description: 'ADCB', active: false},
        {logo: ADIB, description: 'ADIB', active: false},
        {logo: CBD, description: 'CBD', active: false},
        {logo: DIB, description: 'DIB',  active: false},
        {logo: ENBD, description: 'ENBD',  active: false},
        {logo: FAB, description: 'FAB',  active: false},
        {logo: HSBC, description: 'HSBC', id: 'hsbc',  active: false},
        {logo: Mashreq, description: 'Mashreq',  active: false},
      ],
      selectedOption: undefined
    }
  },
  computed:{
    filterredOptions() {
      return this.options.filter(option =>
        option.description.toLowerCase().includes(this.search.toLowerCase())
    )
    }
  },
  methods: {

    setSearch(val) {
      this.search = val.data;
    },
    providerContainer(val) {
      if (val === this.selectedOption) {
        return 'provider-container-selected'
      }
      else if (val.active === false) {
        return 'provider-container-inactive'
      }
      else {
        return 'provider-container'
      }
    },
    optionDescription(val) {
      if (val.active === true) {
        return 'option-description'
      } else {
        return 'option-description-inactive'
      }
    },
    innerOptionCircle(val) {
      if (val === this.selectedOption) {
        return 'inner-option-circle-active'
      }
      else {
        return ''
      }
    },
    selectOption(val) {
      if(val.active === true) {
      this.selectedOption = val
      this.$emit("output", val.id);
      }
      else {
        return;
      }
    }
  }
}
</script>