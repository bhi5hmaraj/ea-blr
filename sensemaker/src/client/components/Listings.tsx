import {
  Datagrid,
  DateField,
  List,
  SelectInput,
  TextField,
  TextInput,
} from 'react-admin';
import { ListingKind } from '@/lib/schema';

const makeChoices = (options: readonly string[]) =>
  options.map((value) => ({ id: value, name: value }));

const listingKindChoices = makeChoices(ListingKind.options);

export const listingFilters = [
  <TextInput key="orgName" source="orgName" alwaysOn />,
  <SelectInput key="kind" source="kind" choices={listingKindChoices} />,
];

export function ListingList() {
  return (
    <List sort={{ field: 'updatedAt', order: 'DESC' }} filters={listingFilters}>
      <Datagrid bulkActionButtons={false}>
        <TextField source="id" />
        <TextField source="kind" />
        <TextField source="title" />
        <TextField source="orgName" />
        <TextField source="selectedRevisionId" />
        <DateField source="updatedAt" showTime />
      </Datagrid>
    </List>
  );
}
